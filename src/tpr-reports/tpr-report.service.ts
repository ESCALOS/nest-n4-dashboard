import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../database/redis/redis.service';
import { TPR_DEFAULT_SUMMARY_ROWS } from './tpr-report.defaults';
import {
  TprCachedDetailPage,
  TprCachedSummary,
  TprDetailReportType,
  TprDetailResponse,
  TprReportType,
  TprSummaryResponse,
  TprSummaryRow,
} from './tpr-report.types';
import { TprPeriodRange, TprReportRepository } from './tpr-report.repository';

interface CacheReadResult<T> {
  value: T | null;
  available: boolean;
}

@Injectable()
export class TprReportService {
  private readonly logger = new Logger(TprReportService.name);
  private readonly currentMonthTtl: number;
  private readonly closedMonthTtl: number;
  private readonly lockTtl: number;
  private readonly detailMaxLimit: number;
  private readonly timezone: string;
  readonly exportBatchSize: number;

  constructor(
    private readonly repository: TprReportRepository,
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.currentMonthTtl = this.positiveConfig(
      configService.get<number>('tprReports.currentMonthTtlSeconds'),
      600,
    );
    this.closedMonthTtl = this.positiveConfig(
      configService.get<number>('tprReports.closedMonthTtlSeconds'),
      604800,
    );
    this.lockTtl = this.positiveConfig(
      configService.get<number>('tprReports.regenerationLockTtlSeconds'),
      120,
    );
    this.detailMaxLimit = Math.min(
      200,
      this.positiveConfig(
        configService.get<number>('tprReports.detailMaxLimit'),
        200,
      ),
    );
    this.exportBatchSize = Math.min(
      this.detailMaxLimit,
      this.positiveConfig(
        configService.get<number>('tprReports.exportBatchSize'),
        200,
      ),
    );
    this.timezone =
      configService.get<string>('tprReports.timezone') || 'America/Lima';
  }

  async getSummary(
    period: string,
    type: TprReportType,
  ): Promise<TprSummaryResponse> {
    const version = await this.getActiveVersion(period);
    const cacheKey = this.summaryKey(period, version);
    const cached = await this.readCache<TprCachedSummary>(cacheKey);

    if (cached.value) {
      this.logger.debug(`TPR summary cache hit for ${period} v${version}`);
      return this.summaryResponse(period, type, cached.value, true);
    }

    this.logger.debug(`TPR summary cache miss for ${period} v${version}`);
    const payload = await this.buildSummaryPayload(period);
    if (cached.available) {
      await this.writeCache(cacheKey, payload, this.ttlFor(period));
    }
    return this.summaryResponse(period, type, payload, false);
  }

  async getDetails(
    period: string,
    reportType: TprDetailReportType,
    uniqueId: string,
    page: number,
    limit: number,
  ): Promise<TprDetailResponse> {
    if (limit > this.detailMaxLimit) {
      throw new BadRequestException(
        `TPR detail limit cannot exceed ${this.detailMaxLimit}`,
      );
    }
    const summary = await this.getSummary(period, TprReportType.ALL);
    const topic = summary.rows.find(
      (row) => row.uniqueId === uniqueId && row.reportType === reportType,
    );
    if (!topic) {
      throw new NotFoundException('TPR topic was not found');
    }
    if (!topic.hasDetails) {
      throw new BadRequestException('TPR topic has no detail records');
    }

    const version = await this.getActiveVersion(period);
    const cacheKey = this.detailKey(
      period,
      version,
      reportType,
      uniqueId,
      page,
      limit,
    );
    const cached = await this.readCache<TprCachedDetailPage>(cacheKey);
    if (cached.value) {
      return this.detailResponse(
        period,
        reportType,
        uniqueId,
        page,
        limit,
        cached.value,
        true,
      );
    }

    const range = this.periodRange(period);
    const result = await this.repository.getDetails(
      range,
      reportType,
      uniqueId,
      (page - 1) * limit,
      limit,
    );
    const payload: TprCachedDetailPage = {
      generatedAt: new Date().toISOString(),
      accountDescription: topic.accountDescription,
      total: result.total,
      rows: result.rows,
    };
    if (cached.available) {
      await this.writeCache(cacheKey, payload, this.ttlFor(period));
    }

    return this.detailResponse(
      period,
      reportType,
      uniqueId,
      page,
      limit,
      payload,
      false,
    );
  }

  async regenerate(
    period: string,
    user: { userId: string; email: string },
  ): Promise<TprSummaryResponse> {
    const lockKey = this.lockKey(period);
    const lockOwner = randomUUID();
    let lockAcquired = false;

    try {
      lockAcquired = await this.redis.setIfAbsent(
        lockKey,
        lockOwner,
        this.lockTtl,
      );
    } catch (error) {
      this.logger.error('Redis unavailable while acquiring TPR lock', error);
      throw new ServiceUnavailableException(
        'TPR cache regeneration is temporarily unavailable',
      );
    }

    if (!lockAcquired) {
      throw new ConflictException('TPR report is already being regenerated');
    }

    const startedAt = Date.now();
    let activated = false;
    try {
      const currentVersion = await this.getActiveVersionStrict(period);
      const nextVersion = currentVersion + 1;
      const payload = await this.buildSummaryPayload(period);
      await this.redis.setJson(
        this.summaryKey(period, nextVersion),
        payload,
        this.ttlFor(period),
      );

      activated = await this.redis.activateVersionAndReleaseLock(
        this.versionKey(period),
        nextVersion,
        lockKey,
        lockOwner,
      );
      if (!activated) {
        throw new ConflictException(
          'TPR regeneration lock expired before activation',
        );
      }

      this.logger.log(
        `TPR ${period} regenerated as v${nextVersion} by ${user.email} (${user.userId}) in ${Date.now() - startedAt}ms`,
      );
      return this.summaryResponse(period, TprReportType.ALL, payload, false);
    } finally {
      if (!activated) {
        try {
          await this.redis.compareAndDelete(lockKey, lockOwner);
        } catch (error) {
          this.logger.error('Failed to release TPR regeneration lock', error);
        }
      }
    }
  }

  private async buildSummaryPayload(period: string): Promise<TprCachedSummary> {
    const range = this.periodRange(period);
    const startedAt = Date.now();
    const [containerRows, truckRows] = await Promise.all([
      this.repository.getContainerSummary(range),
      this.repository.getTruckSummary(range),
    ]);
    const rows = [...containerRows, ...truckRows].sort((a, b) =>
      a.uniqueId.localeCompare(b.uniqueId),
    );
    this.logger.log(
      `TPR summary ${period} generated with ${rows.length} topics in ${Date.now() - startedAt}ms`,
    );
    return {
      generatedAt: new Date().toISOString(),
      rows,
    };
  }

  private summaryResponse(
    period: string,
    type: TprReportType,
    payload: TprCachedSummary,
    cached: boolean,
  ): TprSummaryResponse {
    const operationalRows =
      type === TprReportType.ALL
        ? payload.rows
        : payload.rows.filter((row) => row.reportType === type);
    const rows: TprSummaryRow[] = operationalRows.map((row) => ({
      ...row,
      hasDetails: row.total > 0,
    }));
    if (type === TprReportType.ALL) {
      rows.push(...TPR_DEFAULT_SUMMARY_ROWS);
    }
    return {
      period,
      generatedAt: payload.generatedAt,
      cached,
      rows,
    };
  }

  private detailResponse(
    period: string,
    reportType: TprDetailReportType,
    uniqueId: string,
    page: number,
    limit: number,
    payload: TprCachedDetailPage,
    cached: boolean,
  ): TprDetailResponse {
    return {
      period,
      reportType,
      uniqueId,
      accountDescription: payload.accountDescription,
      generatedAt: payload.generatedAt,
      cached,
      rows: payload.rows,
      pagination: {
        page,
        limit,
        total: payload.total,
        totalPages: Math.ceil(payload.total / limit),
      },
    };
  }

  periodRange(period: string): TprPeriodRange {
    const [year, month] = period.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  ttlFor(period: string): number {
    return period === this.currentPeriod()
      ? this.currentMonthTtl
      : this.closedMonthTtl;
  }

  private currentPeriod(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${month}`;
  }

  private async getActiveVersion(period: string): Promise<number> {
    try {
      return await this.getActiveVersionStrict(period);
    } catch {
      this.logger.warn(
        `Redis unavailable while reading TPR version for ${period}; bypassing cache`,
      );
      return 1;
    }
  }

  private async getActiveVersionStrict(period: string): Promise<number> {
    const value = await this.redis.get(this.versionKey(period));
    const version = Number(value ?? 1);
    return Number.isInteger(version) && version > 0 ? version : 1;
  }

  private async readCache<T>(key: string): Promise<CacheReadResult<T>> {
    try {
      return { value: await this.redis.getJson<T>(key), available: true };
    } catch {
      this.logger.warn(`Redis read failed for ${key}; bypassing cache`);
      return { value: null, available: false };
    }
  }

  private async writeCache<T>(
    key: string,
    value: T,
    ttl: number,
  ): Promise<void> {
    try {
      await this.redis.setJson(key, value, ttl);
    } catch {
      this.logger.warn(
        `Redis write failed for ${key}; response was not cached`,
      );
    }
  }

  private versionKey(period: string): string {
    return `report:tpr:${period}:version`;
  }

  private summaryKey(period: string, version: number): string {
    return `report:tpr:${period}:v${version}:summary`;
  }

  private detailKey(
    period: string,
    version: number,
    reportType: TprDetailReportType,
    uniqueId: string,
    page: number,
    limit: number,
  ): string {
    return `report:tpr:${period}:v${version}:detail:${reportType}:${uniqueId}:page:${page}:limit:${limit}`;
  }

  private lockKey(period: string): string {
    return `report:tpr:${period}:lock`;
  }

  private positiveConfig(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && Number(value) > 0
      ? Number(value)
      : fallback;
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { N4Service } from 'src/database/n4/n4.service';
import { RedisService } from 'src/database/redis/redis.service';
import { CACHE_KEYS } from 'src/common/constants/cache-keys.constant';
import { ManifestDto } from './dto/manifest.dto';
import { OperationVesselItemDto } from './dto/OperationVesselItem.dto';
import { IS_BL_ITEM_AS, OperationType, IS_GATE_TRANSACTION } from './enums/operation-type.enum';
import { TransactionDto } from './dto/transaction.dto';
import { TransactionResult } from 'src/database/n4/n4.interfaces';
import { Manifest } from './interfaces/manifest.interface';
import { Summary } from './interfaces/summary.interface';
import { Transaction } from './interfaces/transaction.interface';
import {
  MonitoringGeneralCargoResponse,
  VesselData,
} from './dto/operation-vessel-response.dto';
import { StockpilingTicketDto } from './dto/stockpiling-ticket.dto';

@Injectable()
export class GeneralCargoService {
  private readonly logger = new Logger(GeneralCargoService.name);

  constructor(
    private readonly n4Service: N4Service,
    private readonly redisService: RedisService,
  ) { }

  // ============================================
  // DATA FETCHING (cache-aside pattern)
  // ============================================

  async getManifest(manifestId: string): Promise<ManifestDto> {
    const cacheKey = CACHE_KEYS.manifest(manifestId);

    const cached = await this.redisService.getJson<ManifestDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for manifest ${manifestId}`);
      return cached;
    }

    const result = await this.n4Service.getManifest(manifestId);
    if (!result) {
      throw new NotFoundException(`El número de manifiesto ${manifestId} no fue encontrado`);
    }

    const manifest: ManifestDto = {
      id: manifestId,
      gkey: result.gkey,
      vvdGkey: result.vvd_gkey,
      vesselName: result.vessel_name,
    };

    await this.redisService.setJson(cacheKey, manifest);

    return manifest;
  }

  async getHolds(manifestId: string): Promise<OperationVesselItemDto[]> {
    const manifest = await this.getManifest(manifestId);
    const cacheKey = CACHE_KEYS.holds(manifest.vvdGkey);

    const cached =
      await this.redisService.getJson<OperationVesselItemDto[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for holds vvdGkey ${manifest.vvdGkey}`);
      return cached;
    }

    const results = await this.n4Service.getHolds(manifest.vvdGkey);
    const holds: OperationVesselItemDto[] = results.map((r) => ({
      gkey: r.gkey,
      nbr: r.nbr,
      manifested_weight: r.manifested_weight,
      manifested_goods: r.manifested_goods,
    }));

    await this.redisService.setJson(cacheKey, holds);
    return holds;
  }

  async getBLItems(
    manifestId: string,
    operationType: OperationType,
  ): Promise<OperationVesselItemDto[]> {
    const manifest = await this.getManifest(manifestId);
    const isAs = IS_BL_ITEM_AS[operationType];
    const cacheKey = CACHE_KEYS.blItems(manifest.gkey, isAs);

    const cached =
      await this.redisService.getJson<OperationVesselItemDto[]>(cacheKey);
    if (cached) {
      this.logger.debug(
        `Cache hit for BL items cvGkey ${manifest.gkey} isAs ${isAs}`,
      );
      return cached;
    }

    const results = await this.n4Service.getBLItems(manifest.gkey, isAs);
    const blItems: OperationVesselItemDto[] = results.map((r) => ({
      gkey: r.gkey,
      nbr: r.nbr,
      manifested_weight: r.manifested_weight,
      manifested_goods: r.manifested_goods,
    }));

    await this.redisService.setJson(cacheKey, blItems);
    return blItems;
  }

  async getTransactions(
    manifestId: string,
    operationType: OperationType,
  ): Promise<TransactionDto[]> {
    const cacheKey = CACHE_KEYS.transactions(manifestId, operationType);

    const cached = await this.redisService.getJson<TransactionDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    return this.fetchAndCacheTransactions(manifestId, operationType);
  }

  async fetchAndCacheTransactions(
    manifestId: string,
    operationType: OperationType,
  ): Promise<TransactionDto[]> {
    const blItems = await this.getBLItems(manifestId, operationType);
    const blItemGkeys = blItems.map((item) => item.gkey);

    if (blItemGkeys.length === 0) {
      return [];
    }

    const results: TransactionResult[] = await this.n4Service.getTransactions(
      blItemGkeys,
      IS_GATE_TRANSACTION[operationType],
    );

    const transactions: TransactionDto[] = results.map((r) => ({
      hold: r.hold,
      bl_item_gkey: r.bl_item_gkey,
      shift: r.shift,
      total_weight: r.total_weight,
      total_goods: r.total_goods,
      total_tickets: r.total_tickets,
    }));

    const cacheKey = CACHE_KEYS.transactions(manifestId, operationType);
    await this.redisService.setJson(cacheKey, transactions);

    return transactions;
  }

  async getStockpilingTickets(blItemGkeys: number[]): Promise<StockpilingTicketDto[]> {
    if (blItemGkeys.length === 0) return [];

    return await this.n4Service.getStockpilingTickets(blItemGkeys);
  }

  /**
   * Invalidate holds cache and re-fetch from N4.
   */
  async refreshHolds(manifestId: string): Promise<OperationVesselItemDto[]> {
    const manifest = await this.getManifest(manifestId);
    const cacheKey = CACHE_KEYS.holds(manifest.vvdGkey);
    await this.redisService.del(cacheKey);
    this.logger.log(`Cache invalidated for holds vvdGkey ${manifest.vvdGkey}`);
    return this.getHolds(manifestId);
  }

  /**
   * Invalidate BL items (services) cache and re-fetch from N4.
   */
  async refreshBLItems(
    manifestId: string,
    operationType: OperationType,
  ): Promise<OperationVesselItemDto[]> {
    const manifest = await this.getManifest(manifestId);
    const isAs = IS_BL_ITEM_AS[operationType];
    const cacheKey = CACHE_KEYS.blItems(manifest.gkey, isAs);
    await this.redisService.del(cacheKey);
    this.logger.log(`Cache invalidated for BL items cvGkey ${manifest.gkey} isAs ${isAs}`);
    return this.getBLItems(manifestId, operationType);
  }

  // ============================================
  // MONITORED OPERATIONS MANAGEMENT
  // ============================================

  /**
   * Encode a manifest+operationType pair as a single Redis set member.
   */
  private encodeOperation(manifestId: string, operationType: OperationType): string {
    return `${manifestId}::${operationType}`;
  }

  /**
   * Decode a Redis set member back into manifestId + operationType.
   */
  private decodeOperation(encoded: string): { manifestId: string; operationType: OperationType } {
    const [manifestId, operationType] = encoded.split('::');
    return { manifestId, operationType: operationType as OperationType };
  }

  /**
   * Register a manifest + operation type for monitoring.
   * The background job will refresh only registered combinations.
   */
  async addMonitoredOperation(
    manifestId: string,
    operationType: OperationType,
  ): Promise<void> {
    // Validate the manifest exists in N4
    await this.getManifest(manifestId);

    const member = this.encodeOperation(manifestId, operationType);
    await this.redisService.sadd(CACHE_KEYS.monitoredOperations, member);

    this.logger.log(
      `Added monitored operation: ${manifestId} / ${operationType}`,
    );
  }

  /**
   * Return all currently monitored operations with manifest info.
   */
  async getMonitoredOperations(): Promise<
    { manifest: Manifest; operation_type: OperationType }[]
  > {
    const members = await this.redisService.smembers(
      CACHE_KEYS.monitoredOperations,
    );

    const results = await Promise.all(
      members.map(async (m) => {
        const { manifestId, operationType } = this.decodeOperation(m);
        try {
          const manifestDto = await this.getManifest(manifestId);
          return {
            manifest: { id: manifestDto.id, name: manifestDto.vesselName } as Manifest,
            operation_type: operationType,
          };
        } catch {
          // If manifest no longer exists, still return with id only
          return {
            manifest: { id: manifestId, name: 'Unknown' } as Manifest,
            operation_type: operationType,
          };
        }
      }),
    );

    return results;
  }

  /**
   * Remove a manifest + operation type from monitoring.
   * Also cleans up the transaction cache for that combination.
   */
  async removeMonitoredOperation(
    manifestId: string,
    operationType: OperationType,
  ): Promise<void> {
    const member = this.encodeOperation(manifestId, operationType);
    await this.redisService.srem(CACHE_KEYS.monitoredOperations, member);

    // Clean transaction cache for this combination
    const txKey = CACHE_KEYS.transactions(manifestId, operationType);
    await this.redisService.del(txKey);

    this.logger.log(
      `Removed monitored operation: ${manifestId} / ${operationType}`,
    );
  }

  // ============================================
  // RESPONSE BUILDER
  // ============================================

  async getMonitoringData(
    manifestId: string,
    operationType: OperationType,
  ): Promise<MonitoringGeneralCargoResponse> {
    const [manifest, holds, blItems, rawTransactions] = await Promise.all([
      this.getManifest(manifestId),
      this.getHolds(manifestId),
      this.getBLItems(manifestId, operationType),
      this.getTransactions(manifestId, operationType),
    ]);

    // Build manifest response
    const manifestResponse: Manifest = {
      id: manifest.id,
      name: manifest.vesselName,
    };

    // Build BL item gkey -> nbr map for transaction mapping
    const blItemMap = new Map<number, string>(
      blItems.map((item) => [item.gkey, item.nbr]),
    );

    // Build hold summaries
    const holdSummaries = this.buildHoldSummaries(holds, rawTransactions);

    // Build service (BL item) summaries
    const serviceSummaries = this.buildServiceSummaries(
      blItems,
      rawTransactions,
    );

    // Extract unique shifts
    const shiftsWorked = this.extractShiftsWorked(rawTransactions);

    // Build transactions for response
    const transactions: Transaction[] = rawTransactions.map((t) => ({
      hold: t.hold,
      serviceId: t.bl_item_gkey,
      shift: t.shift,
      weight: t.total_weight,
      goods: t.total_goods,
      totalTickets: t.total_tickets,
    }));

    const data: VesselData = {
      manifest: manifestResponse,
      operation_type: operationType,
      summary: {
        holds: holdSummaries,
        services: serviceSummaries,
      },
      last_update: new Date().toISOString(),
      shifts_worked: shiftsWorked,
      transactions,
    };

    return {
      success: true,
      data,
    };
  }

  // ============================================
  // SUMMARY BUILDERS
  // ============================================

  private buildHoldSummaries(
    holds: OperationVesselItemDto[],
    transactions: TransactionDto[],
  ): Summary[] {
    return holds.map((hold) => {
      const holdTransactions = transactions.filter(
        (t) => t.hold === hold.nbr,
      );

      const totalWeight = holdTransactions.reduce(
        (sum, t) => sum + t.total_weight,
        0,
      );
      const totalGoods = holdTransactions.reduce(
        (sum, t) => sum + t.total_goods,
        0,
      );

      // Group by shift
      const shifts: Record<string, { weight: number; goods: number }> = {};
      for (const t of holdTransactions) {
        if (!shifts[t.shift]) {
          shifts[t.shift] = { weight: 0, goods: 0 };
        }
        shifts[t.shift].weight += t.total_weight;
        shifts[t.shift].goods += t.total_goods;
      }

      return {
        id: hold.gkey,
        nbr: hold.nbr,
        weight: {
          manifested: hold.manifested_weight,
          processed: totalWeight,
        },
        goods: {
          manifested: hold.manifested_goods,
          processed: totalGoods,
        },
        shifts,
      };
    });
  }

  private buildServiceSummaries(
    blItems: OperationVesselItemDto[],
    transactions: TransactionDto[],
  ): Summary[] {
    return blItems.map((blItem) => {
      const itemTransactions = transactions.filter(
        (t) => t.bl_item_gkey === blItem.gkey,
      );

      const totalWeight = itemTransactions.reduce(
        (sum, t) => sum + t.total_weight,
        0,
      );
      const totalGoods = itemTransactions.reduce(
        (sum, t) => sum + t.total_goods,
        0,
      );

      // Group by shift
      const shifts: Record<string, { weight: number; goods: number }> = {};
      for (const t of itemTransactions) {
        if (!shifts[t.shift]) {
          shifts[t.shift] = { weight: 0, goods: 0 };
        }
        shifts[t.shift].weight += t.total_weight;
        shifts[t.shift].goods += t.total_goods;
      }

      return {
        id: blItem.gkey,
        nbr: blItem.nbr,
        weight: {
          manifested: blItem.manifested_weight,
          processed: totalWeight,
        },
        goods: {
          manifested: blItem.manifested_goods,
          processed: totalGoods,
        },
        shifts,
      };
    });
  }

  private extractShiftsWorked(transactions: TransactionDto[]): string[] {
    const shifts = new Set<string>();
    for (const t of transactions) {
      shifts.add(t.shift);
    }
    return Array.from(shifts).sort();
  }
}

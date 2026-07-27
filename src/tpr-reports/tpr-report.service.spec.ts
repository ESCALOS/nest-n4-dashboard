import { ConfigService } from '@nestjs/config';
import { RedisService } from '../database/redis/redis.service';
import { TPR_DEFAULT_SUMMARY_ROWS } from './tpr-report.defaults';
import { TprReportRepository } from './tpr-report.repository';
import { TprReportService } from './tpr-report.service';
import { TprOperationalSummaryRow, TprReportType } from './tpr-report.types';

describe('TprReportService', () => {
  const containerRow: TprOperationalSummaryRow = {
    uniqueId: '5X111110BDRY20FT',
    accountDescription: 'Container Vessel Discharge Local Full Dry 20',
    total: 0,
    reportType: TprReportType.CONTAINER_VESSEL,
  };
  const truckRow: TprOperationalSummaryRow = {
    uniqueId: '5X311110BDRY20FT',
    accountDescription: 'Truck IN Local Full Dry 20',
    total: 4,
    reportType: TprReportType.TRUCK_IN_OUT,
  };

  function createSubject() {
    const repository = {
      getContainerSummary: jest.fn().mockResolvedValue([containerRow]),
      getTruckSummary: jest.fn().mockResolvedValue([truckRow]),
      getDetails: jest.fn(),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      setIfAbsent: jest.fn().mockResolvedValue(true),
      activateVersionAndReleaseLock: jest.fn().mockResolvedValue(true),
      compareAndDelete: jest.fn().mockResolvedValue(true),
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'tprReports.currentMonthTtlSeconds': 600,
          'tprReports.closedMonthTtlSeconds': 604800,
          'tprReports.regenerationLockTtlSeconds': 120,
          'tprReports.detailMaxLimit': 200,
          'tprReports.exportBatchSize': 200,
          'tprReports.timezone': 'America/Lima',
        };
        return values[key];
      }),
    };

    const service = new TprReportService(
      repository as unknown as TprReportRepository,
      redis as unknown as RedisService,
      config as unknown as ConfigService,
    );
    return { service, repository, redis };
  }

  it('returns and filters a cached canonical summary without querying N4', async () => {
    const { service, repository, redis } = createSubject();
    redis.getJson.mockResolvedValue({
      generatedAt: '2026-07-24T10:00:00.000Z',
      rows: [containerRow, truckRow],
    });

    const response = await service.getSummary(
      '2026-07',
      TprReportType.TRUCK_IN_OUT,
    );

    expect(response.cached).toBe(true);
    expect(response.rows).toEqual([{ ...truckRow, hasDetails: true }]);
    expect(repository.getContainerSummary).not.toHaveBeenCalled();
    expect(repository.getTruckSummary).not.toHaveBeenCalled();
  });

  it('queries both report sources on a miss and preserves zero-total topics', async () => {
    const { service, repository, redis } = createSubject();

    const response = await service.getSummary('2026-06', TprReportType.ALL);

    expect(repository.getContainerSummary).toHaveBeenCalledTimes(1);
    expect(repository.getTruckSummary).toHaveBeenCalledTimes(1);
    expect(
      response.rows.find((row) => row.uniqueId === containerRow.uniqueId),
    ).toEqual({
      ...containerRow,
      hasDetails: false,
    });
    expect(response.rows.slice(-9)).toEqual(TPR_DEFAULT_SUMMARY_ROWS);
    expect(redis.setJson).toHaveBeenCalledTimes(1);
  });

  it('appends nine defaults after 48 operational topics only for ALL', async () => {
    const { service, repository } = createSubject();
    repository.getContainerSummary.mockResolvedValue(
      Array.from({ length: 36 }, (_, index) => ({
        ...containerRow,
        uniqueId: `CV${String(index).padStart(2, '0')}`,
      })),
    );
    repository.getTruckSummary.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        ...truckRow,
        uniqueId: `TR${String(index).padStart(2, '0')}`,
      })),
    );

    const all = await service.getSummary('2026-06', TprReportType.ALL);
    expect(all.rows).toHaveLength(57);
    expect(all.rows.slice(-9)).toEqual(TPR_DEFAULT_SUMMARY_ROWS);
    expect(typeof all.rows.at(-1)?.total).toBe('number');
    expect(all.rows.at(-1)?.total).toBe(11895.3);

    const { service: filteredService } = createSubject();
    const truck = await filteredService.getSummary(
      '2026-06',
      TprReportType.TRUCK_IN_OUT,
    );
    expect(truck.rows).toHaveLength(1);
    expect(truck.rows.every((row) => row.reportType !== null)).toBe(true);
  });

  it('does not query N4 detail for a zero-total topic', async () => {
    const { service, repository, redis } = createSubject();
    redis.getJson.mockResolvedValue({
      generatedAt: '2026-07-24T10:00:00.000Z',
      rows: [containerRow],
    });

    await expect(
      service.getDetails(
        '2026-07',
        TprReportType.CONTAINER_VESSEL,
        containerRow.uniqueId,
        1,
        100,
      ),
    ).rejects.toThrow('TPR topic has no detail records');
    expect(repository.getDetails).not.toHaveBeenCalled();
  });

  it('uses the short TTL for the current Lima month and the long TTL otherwise', () => {
    const { service } = createSubject();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const current = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;

    expect(service.ttlFor(current)).toBe(600);
    expect(service.ttlFor('2000-01')).toBe(604800);
  });

  it('activates the next cache version only after generating the summary', async () => {
    const { service, redis } = createSubject();
    redis.get.mockResolvedValue('7');

    await service.regenerate('2026-06', {
      userId: 'user-1',
      email: 'admin@example.com',
    });

    expect(redis.setIfAbsent).toHaveBeenCalled();
    expect(redis.setJson).toHaveBeenCalledWith(
      expect.stringContaining(':v8:summary'),
      expect.any(Object),
      604800,
    );
    expect(redis.activateVersionAndReleaseLock).toHaveBeenCalledWith(
      expect.any(String),
      8,
      expect.any(String),
      expect.any(String),
    );
  });
});

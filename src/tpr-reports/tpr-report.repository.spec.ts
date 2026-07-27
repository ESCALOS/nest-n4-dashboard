import { ConfigService } from '@nestjs/config';
import { N4Service } from '../database/n4/n4.service';
import { TPR_VESSEL_CALLS_UNIQUE_ID } from './tpr-report.defaults';
import { TprReportQueries } from './tpr-report.queries';
import { TprReportRepository } from './tpr-report.repository';
import { TprReportType } from './tpr-report.types';

describe('TprReportRepository', () => {
  const range = {
    start: new Date('2026-06-01T00:00:00.000Z'),
    end: new Date('2026-07-01T00:00:00.000Z'),
  };

  function createSubject() {
    const n4Service = {
      query: jest.fn(),
    };
    const config = {
      get: jest.fn().mockReturnValue(53),
    };
    const repository = new TprReportRepository(
      n4Service as unknown as N4Service,
      config as unknown as ConfigService,
    );
    return { repository, n4Service };
  }

  it('marks Vessel calls as the only container topic without detail support', async () => {
    const { repository, n4Service } = createSubject();
    n4Service.query.mockResolvedValue({
      recordset: [
        {
          unique_id: '5X111110BDRY20FT',
          account_description: "Container Vessel Discharge Local Full Dry 20'",
          total: 2,
        },
        {
          unique_id: TPR_VESSEL_CALLS_UNIQUE_ID,
          account_description: 'Container Vessel calls',
          total: 10,
        },
      ],
    });

    const rows = await repository.getContainerSummary(range);

    expect(rows).toEqual([
      expect.objectContaining({
        uniqueId: '5X111110BDRY20FT',
        supportsDetails: true,
      }),
      expect.objectContaining({
        uniqueId: TPR_VESSEL_CALLS_UNIQUE_ID,
        supportsDetails: false,
      }),
    ]);
  });

  it('routes Container Vessel detail through the movement query', async () => {
    const { repository, n4Service } = createSubject();
    n4Service.query.mockResolvedValue({
      recordset: [
        {
          account_description: "Container Vessel Discharge Local Full Dry 20'",
          movement_date: new Date('2026-06-10T15:00:00.000Z'),
          container: 'TEST0000001',
          operation: 'DSCH',
          normalized_status: 'FULL',
          normalized_equipment: 'DRY',
          size_description: "20'",
          iso: '22G1',
          container_type: '20 Foot Dry',
          category: 'IMPRT',
          shipping_line: 'MSK',
          shipping_line_name: 'Maersk',
          manifest: '2026-100',
          vessel: 'TEST VESSEL',
          total_count: 1,
        },
      ],
    });

    const result = await repository.getDetails(
      range,
      TprReportType.CONTAINER_VESSEL,
      '5X111110BDRY20FT',
      0,
      100,
    );

    expect(n4Service.query).toHaveBeenCalledWith(
      TprReportQueries.containerDetails,
      'tprContainerDetails',
      expect.any(Function),
    );
    expect(result.rows[0]).toMatchObject({
      operation: 'DSCH',
      shippingLine: 'MSK',
      shippingLineName: 'Maersk',
      manifest: '2026-100',
      vessel: 'TEST VESSEL',
    });
  });
});

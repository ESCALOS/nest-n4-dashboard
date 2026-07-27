import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { TPR_VESSEL_CALLS_UNIQUE_ID } from './tpr-report.defaults';
import { TprReportExcelService } from './tpr-report-excel.service';
import { TprReportService } from './tpr-report.service';
import { TprDetailKind, TprReportType } from './tpr-report.types';

describe('TprReportExcelService', () => {
  it('exports Vessel calls ATD using d/mm/yyyy hh:mm', async () => {
    const reportService = {
      exportBatchSize: 100,
      getDetails: jest.fn().mockResolvedValue({
        period: '2026-06',
        reportType: TprReportType.CONTAINER_VESSEL,
        uniqueId: TPR_VESSEL_CALLS_UNIQUE_ID,
        accountDescription: 'Container Vessel calls',
        generatedAt: '2026-07-27T10:00:00.000Z',
        cached: true,
        detailKind: TprDetailKind.VESSEL_CALLS,
        rows: [
          {
            atd: '2026-06-03T17:30:00.000Z',
            manifest: '2026-233',
            vessel: 'MSC ZONDA III',
          },
        ],
        pagination: {
          page: 1,
          limit: 100,
          total: 1,
          totalPages: 1,
        },
      }),
    };
    const service = new TprReportExcelService(
      reportService as unknown as TprReportService,
    );
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const response = stream as unknown as Response;
    response.setHeader = jest.fn();

    await service.exportDetails(
      response,
      '2026-06',
      TprReportType.CONTAINER_VESSEL,
      TPR_VESSEL_CALLS_UNIQUE_ID,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks));
    const worksheet = workbook.getWorksheet('Detalle');

    expect(worksheet?.getCell('A1').value).toBe('ATD');
    expect(worksheet?.getCell('A2').numFmt).toBe('d/mm/yyyy hh:mm');
    expect(worksheet?.getCell('B2').value).toBe('2026-233');
    expect(worksheet?.getCell('C2').value).toBe('MSC ZONDA III');
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import {
  TprDetailReportType,
  TprDetailResponse,
  TprSummaryResponse,
} from './tpr-report.types';
import { TprReportService } from './tpr-report.service';

@Injectable()
export class TprReportExcelService {
  private readonly logger = new Logger(TprReportExcelService.name);

  constructor(private readonly reportService: TprReportService) {}

  async exportSummary(
    response: Response,
    report: TprSummaryResponse,
  ): Promise<void> {
    const filename = `Reporte_TPR_${report.period}.xlsx`;
    const workbook = this.createWorkbook(response, filename);
    const worksheet = workbook.addWorksheet('Reporte TPR');
    worksheet.columns = [
      { header: 'UNIQUE ID', key: 'uniqueId', width: 24 },
      {
        header: 'ACCOUNT DESCRIPTION',
        key: 'accountDescription',
        width: 58,
      },
      { header: 'TOTAL', key: 'total', width: 14 },
    ];
    worksheet.getColumn('total').numFmt = '#,##0.##';
    this.styleHeader(worksheet);

    for (const row of report.rows) {
      worksheet
        .addRow({
          uniqueId: row.uniqueId,
          accountDescription: row.accountDescription,
          total: row.total,
        })
        .commit();
    }

    worksheet.commit();
    await workbook.commit();
    this.logger.log(
      `Exported TPR summary ${report.period} with ${report.rows.length} topics`,
    );
  }

  async exportDetails(
    response: Response,
    period: string,
    reportType: TprDetailReportType,
    uniqueId: string,
  ): Promise<void> {
    const safeUniqueId = uniqueId.replace(/[^A-Za-z0-9_-]/g, '_');
    const filename = `Reporte_TPR_Detalle_${safeUniqueId}_${period}.xlsx`;
    const workbook = this.createWorkbook(response, filename);
    const worksheet = workbook.addWorksheet('Detalle');
    worksheet.columns = [
      { header: 'FECHA', key: 'movementDate', width: 22 },
      { header: 'CONTENEDOR', key: 'container', width: 16 },
      { header: 'OPERACIÓN', key: 'operation', width: 16 },
      { header: 'ESTADO', key: 'status', width: 12 },
      { header: 'EQUIPO', key: 'equipment', width: 12 },
      { header: 'TAMAÑO', key: 'size', width: 10 },
      { header: 'ISO', key: 'iso', width: 12 },
      { header: 'TIPO CONTENEDOR', key: 'containerType', width: 30 },
      { header: 'CATEGORY', key: 'category', width: 14 },
      { header: 'LÍNEA', key: 'shippingLine', width: 14 },
      { header: 'NOMBRE LÍNEA', key: 'shippingLineName', width: 30 },
      { header: 'MANIFIESTO', key: 'manifest', width: 18 },
      { header: 'NAVE', key: 'vessel', width: 28 },
    ];
    this.styleHeader(worksheet);

    const batchSize = this.reportService.exportBatchSize;
    let page = 1;
    let detail: TprDetailResponse;
    do {
      detail = await this.reportService.getDetails(
        period,
        reportType,
        uniqueId,
        page,
        batchSize,
      );
      for (const row of detail.rows) {
        worksheet
          .addRow({
            ...row,
            movementDate: new Date(row.movementDate),
            shippingLine: row.shippingLine ?? 'No aplica',
            shippingLineName: row.shippingLineName ?? 'No aplica',
            manifest: row.manifest ?? 'No aplica',
            vessel: row.vessel ?? 'No aplica',
          })
          .commit();
      }
      page += 1;
    } while (page <= detail.pagination.totalPages);

    worksheet.getColumn('movementDate').numFmt = 'dd/mm/yyyy hh:mm:ss';
    worksheet.commit();
    await workbook.commit();
    this.logger.log(
      `Exported TPR detail ${uniqueId}/${period} with ${detail.pagination.total} rows`,
    );
  }

  private createWorkbook(
    response: Response,
    filename: string,
  ): ExcelJS.stream.xlsx.WorkbookWriter {
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: response,
      useStyles: true,
      useSharedStrings: true,
    });
  }

  private styleHeader(worksheet: ExcelJS.Worksheet): void {
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.commit();
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import { N4Service } from '../database/n4/n4.service';
import { TprReportQueries } from './tpr-report.queries';
import { TPR_VESSEL_CALLS_UNIQUE_ID } from './tpr-report.defaults';
import {
  TprDetailReportType,
  TprDetailRow,
  TprDetailSqlRow,
  TprOperationalSummaryRow,
  TprReportType,
  TprSummarySqlRow,
} from './tpr-report.types';

export interface TprPeriodRange {
  start: Date;
  end: Date;
}

export interface TprDetailPageData {
  accountDescription: string | null;
  total: number;
  rows: TprDetailRow[];
}

@Injectable()
export class TprReportRepository {
  private readonly truckGateGkey: number;

  constructor(
    private readonly n4Service: N4Service,
    configService: ConfigService,
  ) {
    this.truckGateGkey = Number(
      configService.get<number>('tprReports.truckGateGkey') ?? 53,
    );
  }

  async getContainerSummary(
    range: TprPeriodRange,
  ): Promise<TprOperationalSummaryRow[]> {
    const result = await this.n4Service.query<TprSummarySqlRow>(
      TprReportQueries.containerSummary,
      'tprContainerSummary',
      (request) => this.bindPeriod(request, range),
    );

    return result.recordset.map((row) => ({
      uniqueId: row.unique_id,
      accountDescription: row.account_description,
      total: Number(row.total),
      reportType: TprReportType.CONTAINER_VESSEL,
      supportsDetails: row.unique_id !== TPR_VESSEL_CALLS_UNIQUE_ID,
    }));
  }

  async getTruckSummary(
    range: TprPeriodRange,
  ): Promise<TprOperationalSummaryRow[]> {
    const result = await this.n4Service.query<TprSummarySqlRow>(
      TprReportQueries.truckSummary,
      'tprTruckSummary',
      (request) => {
        this.bindPeriod(request, range);
        request.input('gate_gkey', sql.BigInt, this.truckGateGkey);
      },
    );

    return result.recordset.map((row) => ({
      uniqueId: row.unique_id,
      accountDescription: row.account_description,
      total: Number(row.total),
      reportType: TprReportType.TRUCK_IN_OUT,
      supportsDetails: true,
    }));
  }

  async getDetails(
    range: TprPeriodRange,
    reportType: TprDetailReportType,
    uniqueId: string,
    offset: number,
    limit: number,
  ): Promise<TprDetailPageData> {
    const isContainer = reportType === TprReportType.CONTAINER_VESSEL;
    const query = isContainer
      ? TprReportQueries.containerDetails
      : TprReportQueries.truckDetails;
    const result = await this.n4Service.query<TprDetailSqlRow>(
      query,
      isContainer ? 'tprContainerDetails' : 'tprTruckDetails',
      (request) => {
        this.bindPeriod(request, range);
        request.input('unique_id', sql.VarChar(30), uniqueId);
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);
        if (!isContainer) {
          request.input('gate_gkey', sql.BigInt, this.truckGateGkey);
        }
      },
    );

    return {
      accountDescription: result.recordset[0]?.account_description ?? null,
      total: Number(result.recordset[0]?.total_count ?? 0),
      rows: result.recordset.map((row) => this.mapDetailRow(row)),
    };
  }

  private bindPeriod(request: sql.Request, range: TprPeriodRange): void {
    request.input('fecha_inicio', sql.DateTime2, range.start);
    request.input('fecha_fin', sql.DateTime2, range.end);
  }

  private mapDetailRow(row: TprDetailSqlRow): TprDetailRow {
    const movementDate =
      row.movement_date instanceof Date
        ? row.movement_date.toISOString()
        : new Date(row.movement_date).toISOString();

    return {
      movementDate,
      container: row.container,
      operation: row.operation,
      status: row.normalized_status,
      equipment: row.normalized_equipment,
      size: row.size_description,
      iso: row.iso,
      containerType: row.container_type,
      category: row.category,
      shippingLine: row.shipping_line ?? null,
      shippingLineName: row.shipping_line_name ?? null,
      manifest: row.manifest ?? null,
      vessel: row.vessel ?? null,
    };
  }
}

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import { N4Queries } from './n4.queries';
import {
  AppointmentStageResult,
  AppointmentResult,
  VesselOperationItemResult,
  ManifestResult,
  ContainerManifestResult,
  ContainerMonitoringResult,
  ContainerMonitoringRefreshResult,
  ContainerOperationTimelineResult,
  VesselByCarrierVisitResult,
  OrderInfoResult,
  TransactionResult,
  StockpilingTicket,
  IndirectShipmentTicket,
  WorkingVesselResult,
  HoldAlertUnitResult,
  PendingAppointmentResult,
} from './n4.interfaces';

@Injectable()
export class N4Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(N4Service.name);
  private pool: sql.ConnectionPool;
  private readonly slowQueryThresholdMs: number;

  constructor(private readonly configService: ConfigService) {
    const configuredThreshold = Number(
      this.configService.get<string | number>('n4.slowQueryThresholdMs') ?? 1000,
    );
    this.slowQueryThresholdMs =
      Number.isFinite(configuredThreshold) && configuredThreshold > 0
        ? configuredThreshold
        : 1000;
  }

  private async executeQuery<T>(
    request: sql.Request,
    query: string,
    operation: string,
  ): Promise<sql.IResult<T>> {
    const start = Date.now();
    const result = await request.query<T>(query);
    const elapsedMs = Date.now() - start;

    this.logger.debug(`[N4 SQL] ${operation} completed in ${elapsedMs}ms`);

    if (elapsedMs >= this.slowQueryThresholdMs) {
      this.logger.warn(
        `[N4 SQL] ${operation} exceeded threshold: ${elapsedMs}ms >= ${this.slowQueryThresholdMs}ms`,
      );
    }

    return result;
  }

  async onModuleInit() {
    const config: sql.config = {
      server: this.configService.get<string>('n4.host')!,
      port: this.configService.get<number>('n4.port'),
      user: this.configService.get<string>('n4.user'),
      password: this.configService.get<string>('n4.password'),
      database: this.configService.get<string>('n4.database'),
      options: {
        encrypt: false,
        trustServerCertificate: true,
        appName: 'dashboard-n4'
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    try {
      this.pool = await sql.connect(config);
      this.logger.log('Connected to N4 SQL Server database');
    } catch (error) {
      this.logger.error('Failed to connect to N4 database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
      this.logger.log('N4 database connection closed');
    }
  }

  // ============================================
  // MANIFEST & VESSEL METHODS
  // ============================================

  async getManifest(manifestId: string): Promise<ManifestResult | null> {
    try {
      const request = this.pool.request();
      request.input('manifestId', sql.VarChar, manifestId);

      const result = await this.executeQuery<ManifestResult>(
        request,
        N4Queries.getManifest,
        'getManifest',
      );
      return result.recordset[0] || null;
    } catch (error) {
      this.logger.error(`Error getting manifest ${manifestId}`, error);
      throw error;
    }
  }

  async getContainerManifest(
    manifestId: string,
  ): Promise<ContainerManifestResult | null> {
    try {
      const request = this.pool.request();
      request.input('manifestId', sql.VarChar, manifestId);

      const result = await this.executeQuery<ContainerManifestResult>(
        request,
        N4Queries.getContainerManifest,
        'getContainerManifest',
      );
      return result.recordset[0] || null;
    } catch (error) {
      this.logger.error(`Error getting container manifest ${manifestId}`, error);
      throw error;
    }
  }

  async getWorkingVessels(): Promise<WorkingVesselResult[]> {
    try {
      const request = this.pool.request();
      const result = await this.executeQuery<WorkingVesselResult>(
        request,
        N4Queries.getWorkingVessels,
        'getWorkingVessels',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting working vessels', error);
      throw error;
    }
  }

  async getVesselsByCarrierVisitGkeys(
    carrierVisitGkeys: number[],
  ): Promise<VesselByCarrierVisitResult[]> {
    if (carrierVisitGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('carrierVisitGkeys', sql.VarChar, carrierVisitGkeys.join(','));

      const result = await this.executeQuery<VesselByCarrierVisitResult>(
        request,
        N4Queries.getVesselsByCarrierVisitGkeys,
        'getVesselsByCarrierVisitGkeys',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting vessels by carrier visit gkeys', error);
      throw error;
    }
  }

  async getOrderInfoByOrderGkeys(
    orderGkeys: number[],
  ): Promise<OrderInfoResult[]> {
    if (orderGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('orderGkeys', sql.VarChar, orderGkeys.join(','));

      const result = await this.executeQuery<OrderInfoResult>(
        request,
        N4Queries.getOrderInfoByOrderGkeys,
        'getOrderInfoByOrderGkeys',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting order info by order gkeys', error);
      throw error;
    }
  }

  // ============================================
  // BL ITEMS METHODS
  // ============================================

  async getBLItems(cvGkey: number, isAs: boolean): Promise<VesselOperationItemResult[]> {
    try {
      const request = this.pool.request();
      request.input('cvGkey', sql.BigInt, cvGkey);

      const result = await this.executeQuery<VesselOperationItemResult>(
        request,
        isAs ? N4Queries.getBLItemsAS : N4Queries.getBLItems,
        isAs ? 'getBLItemsAS' : 'getBLItems',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(`Error getting BL items for cvGkey ${cvGkey}`, error);
      throw error;
    }
  }

  async hasMaizCommodity(cvGkey: number): Promise<boolean> {
    try {
      const request = this.pool.request();
      request.input('cvGkey', sql.BigInt, cvGkey);

      const result = await this.executeQuery<{ has_maiz: number }>(
        request,
        N4Queries.hasMaizCommodity,
        'hasMaizCommodity',
      );
      return result.recordset.length > 0;
    } catch (error) {
      this.logger.error(
        `Error checking MAÍZ commodity for cvGkey ${cvGkey}`,
        error,
      );
      throw error;
    }
  }

  async getBLItemsByPrefix(
    cvGkey: number,
    prefix: 'SSP' | 'OS',
  ): Promise<VesselOperationItemResult[]> {
    try {
      const request = this.pool.request();
      request.input('cvGkey', sql.BigInt, cvGkey);
      request.input('blPrefix', sql.VarChar, `${prefix}%`);

      const result = await this.executeQuery<VesselOperationItemResult>(
        request,
        N4Queries.getBLItemsByPrefix,
        'getBLItemsByPrefix',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(
        `Error getting BL items by prefix ${prefix} for cvGkey ${cvGkey}`,
        error,
      );
      throw error;
    }
  }
  // ============================================
  // HOLDS METHODS
  // ============================================

  async getHolds(vvdGkey: number): Promise<VesselOperationItemResult[]> {
    try {
      const request = this.pool.request();
      request.input('vvdGkey', sql.BigInt, vvdGkey);

      const result = await this.executeQuery<VesselOperationItemResult>(
        request,
        N4Queries.getHolds,
        'getHolds',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(`Error getting bodegas for vvdGkey ${vvdGkey}`, error);
      throw error;
    }
  }

  // ============================================
  // TRANSACTION METHODS
  // ============================================

  async getTransactions(
    blItemGkeys: number[],
    isGateTransaction: boolean,
  ): Promise<TransactionResult[]> {
    if (blItemGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));

      const result = await this.executeQuery<TransactionResult>(
        request,
        isGateTransaction ? N4Queries.getGateTransactions : N4Queries.getControlPesajeTransactions,
        isGateTransaction ? 'getGateTransactions' : 'getControlPesajeTransactions',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting ACOPIO transactions', error);
      throw error;
    }
  }

  async getStockpilingTickets(blItemGkeys: number[]): Promise<StockpilingTicket[]> {
    if (blItemGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));

      const result = await this.executeQuery<StockpilingTicket>(
        request,
        N4Queries.getStockpilingTickets,
        'getStockpilingTickets',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting STOCKPILING tickets', error);
      throw error;
    }
  }

  async getIndirectShipmentTickets(blItemGkeys: number[]): Promise<IndirectShipmentTicket[]> {
    if (blItemGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));

      const result = await this.executeQuery<IndirectShipmentTicket>(
        request,
        N4Queries.getIndirectShipmentTickets,
        'getIndirectShipmentTickets',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting INDIRECT SHIPMENT tickets', error);
      throw error;
    }
  }

  // ============================================
  // HOLD ALERT METHODS
  // ============================================

  async getUnitsWithInvalidHolds(
    blItemGkeys: number[],
    validHolds: string[],
    isGateTransaction: boolean,
  ): Promise<HoldAlertUnitResult[]> {
    if (blItemGkeys.length === 0 || validHolds.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));
      request.input('validHolds', sql.VarChar, validHolds.join(','));

      const result = await this.executeQuery<HoldAlertUnitResult>(
        request,
        isGateTransaction
          ? N4Queries.getGateUnitsWithInvalidHolds
          : N4Queries.getControlPesajeUnitsWithInvalidHolds,
        isGateTransaction
          ? 'getGateUnitsWithInvalidHolds'
          : 'getControlPesajeUnitsWithInvalidHolds',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting units with invalid holds', error);
      throw error;
    }
  }

  // ============================================
  // APPOINTMENTS METHODS
  // ============================================

  async getAppointmentsInProgress(): Promise<AppointmentResult[]> {
    try {
      const request = this.pool.request();
      const result = await this.executeQuery<AppointmentResult>(
        request,
        N4Queries.getAppointmentsInProgress,
        'getAppointmentsInProgress',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting appointments in progress', error);
      throw error;
    }
  }

  async getAppointmentStagesByTranGkeys(
    tranGkeys: Array<number | string>,
  ): Promise<AppointmentStageResult[]> {
    if (tranGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('tranGkeys', sql.VarChar, tranGkeys.join(','));

      const result = await this.executeQuery<AppointmentStageResult>(
        request,
        N4Queries.getAppointmentStagesByTranGkeys,
        'getAppointmentStagesByTranGkeys',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting appointment stages by tran gkeys', error);
      throw error;
    }
  }

  async getPendingAppointments(): Promise<PendingAppointmentResult[]> {
    try {
      const request = this.pool.request();
      const result = await this.executeQuery<PendingAppointmentResult>(
        request,
        N4Queries.getPendingAppointments,
        'getPendingAppointments',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting pending appointments', error);
      throw error;
    }
  }

  async getContainerMonitoringFull(
    carrierVisitGkey: number,
  ): Promise<ContainerMonitoringResult[]> {
    try {
      const request = this.pool.request();
      request.input('carrierVisitGkey', sql.BigInt, carrierVisitGkey);

      const result = await this.executeQuery<ContainerMonitoringResult>(
        request,
        N4Queries.getContainerMonitoringFull,
        'getContainerMonitoringFull',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(
        `Error getting container monitoring full for carrier visit ${carrierVisitGkey}`,
        error,
      );
      throw error;
    }
  }

  async getContainerMonitoringRefresh(
    carrierVisitGkey: number,
  ): Promise<ContainerMonitoringRefreshResult[]> {
    try {
      const request = this.pool.request();
      request.input('carrierVisitGkey', sql.BigInt, carrierVisitGkey);

      const result = await this.executeQuery<ContainerMonitoringRefreshResult>(
        request,
        N4Queries.getContainerMonitoringRefresh,
        'getContainerMonitoringRefresh',
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(
        `Error getting container monitoring refresh for carrier visit ${carrierVisitGkey}`,
        error,
      );
      throw error;
    }
  }

  async getContainerOperationTimeline(
    carrierVisitGkey: number,
  ): Promise<ContainerOperationTimelineResult[]> {
    try {
      const request = this.pool.request();
      request.input('carrierVisitGkey', sql.BigInt, carrierVisitGkey);

      const result = await this.executeQuery<ContainerOperationTimelineResult>(
        request,
        N4Queries.getContainerOperationTimeline,
        'getContainerOperationTimeline',
      );

      return result.recordset;
    } catch (error) {
      this.logger.error(
        `Error getting container operation timeline for carrier visit ${carrierVisitGkey}`,
        error,
      );
      throw error;
    }
  }
}

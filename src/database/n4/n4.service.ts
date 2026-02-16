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
  AppointmentResult,
  VesselOperationItemResult,
  ManifestResult,
  TransactionResult,
  StockpilingTicket,
  WorkingVesselResult,
} from './n4.interfaces';

@Injectable()
export class N4Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(N4Service.name);
  private pool: sql.ConnectionPool;

  constructor(private readonly configService: ConfigService) { }

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

      const result = await request.query<ManifestResult>(N4Queries.getManifest);
      return result.recordset[0] || null;
    } catch (error) {
      this.logger.error(`Error getting manifest ${manifestId}`, error);
      throw error;
    }
  }

  async getWorkingVessels(): Promise<WorkingVesselResult[]> {
    try {
      const request = this.pool.request();
      const result = await request.query<WorkingVesselResult>(N4Queries.getWorkingVessels);
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting working vessels', error);
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

      const result = await request.query<VesselOperationItemResult>(isAs ? N4Queries.getBLItemsAS : N4Queries.getBLItems);
      return result.recordset;
    } catch (error) {
      this.logger.error(`Error getting BL items for cvGkey ${cvGkey}`, error);
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

      const result = await request.query<VesselOperationItemResult>(N4Queries.getHolds);
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

      const result = await request.query<TransactionResult>(
        isGateTransaction ? N4Queries.getGateTransactions : N4Queries.getControlPesajeTransactions,
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

      const result = await request.query<StockpilingTicket>(N4Queries.getStockpilingTickets);
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting STOCKPILING tickets', error);
      throw error;
    }
  }

  // ============================================
  // APPOINTMENTS METHODS
  // ============================================

  async getAppointmentsInProgress(): Promise<AppointmentResult[]> {
    try {
      const request = this.pool.request();
      const result = await request.query<AppointmentResult>(
        N4Queries.getAppointmentsInProgress,
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting appointments in progress', error);
      throw error;
    }
  }
}

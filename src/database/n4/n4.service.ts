import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import { N4Queries } from './n4.queries';

export interface ManifestResult {
  gkey: number;
  vvd_gkey: number;
  name: string;
}

export interface BLItemResult {
  gkey: number;
  nbr: string;
  pesoManifestado: number;
  bultosManifestados: number;
}

export interface BodegaResult {
  gkey: number;
  nbr: string;
  pesoManifestado: number;
  bultosManifestados: number;
}

export interface TransactionResult {
  bodega: string;
  blItemGkey: number;
  jornada: string;
  totalBultos: number;
  totalPeso: number;
}

export interface AppointmentResult {
  Cita: string;
  Fecha: Date;
  Booking: string;
  Linea: string;
  Cliente: string;
  Contenedor: string;
  Tecnologia: string;
  Producto: string;
  Nave: string;
  Placa: string;
  Carreta: string;
  Stage: string;
  Tranquera: Date | null;
  PreGate: Date | null;
  GateIn: Date | null;
  Yard: Date | null;
  Tipo: string;
}

@Injectable()
export class N4Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(N4Service.name);
  private pool: sql.ConnectionPool;

  constructor(private readonly configService: ConfigService) {}

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

  // ============================================
  // BL ITEMS METHODS
  // ============================================

  async getBLItems(cvGkey: number): Promise<BLItemResult[]> {
    try {
      const request = this.pool.request();
      request.input('cvGkey', sql.BigInt, cvGkey);

      const result = await request.query<BLItemResult>(N4Queries.getBLItems);
      return result.recordset;
    } catch (error) {
      this.logger.error(`Error getting BL items for cvGkey ${cvGkey}`, error);
      throw error;
    }
  }

  async getBLItemsAcopio(cvGkey: number): Promise<BLItemResult[]> {
    try {
      const request = this.pool.request();
      request.input('cvGkey', sql.BigInt, cvGkey);

      const result = await request.query<BLItemResult>(
        N4Queries.getBLItemsAcopio,
      );
      return result.recordset;
    } catch (error) {
      this.logger.error(
        `Error getting BL items (acopio) for cvGkey ${cvGkey}`,
        error,
      );
      throw error;
    }
  }

  // ============================================
  // BODEGAS METHODS
  // ============================================

  async getBodegas(vvdGkey: number): Promise<BodegaResult[]> {
    try {
      const request = this.pool.request();
      request.input('vvdGkey', sql.BigInt, vvdGkey);

      const result = await request.query<BodegaResult>(N4Queries.getBodegas);
      return result.recordset;
    } catch (error) {
      this.logger.error(`Error getting bodegas for vvdGkey ${vvdGkey}`, error);
      throw error;
    }
  }

  // ============================================
  // TRANSACTION METHODS
  // ============================================

  async getTransactionsAcopio(
    blItemGkeys: number[],
  ): Promise<TransactionResult[]> {
    if (blItemGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));

      const result = await request.query<TransactionResult>(
        N4Queries.getTransactionsAcopio,
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting ACOPIO transactions', error);
      throw error;
    }
  }

  async getTransactionsEmbarqueIndirecto(
    blItemGkeys: number[],
  ): Promise<TransactionResult[]> {
    if (blItemGkeys.length === 0) return [];

    try {
      const request = this.pool.request();
      request.input('blItemGkeys', sql.VarChar, blItemGkeys.join(','));

      const result = await request.query<TransactionResult>(
        N4Queries.getTransactionsEmbarqueIndirecto,
      );
      return result.recordset;
    } catch (error) {
      this.logger.error('Error getting EMBARQUE_INDIRECTO transactions', error);
      throw error;
    }
  }

  async getTransactionsDespacho(
    blItemGkeys: number[],
  ): Promise<TransactionResult[]> {
    // TODO: Implement when query is ready
    this.logger.warn('DESPACHO transactions not yet implemented');
    return [];
  }

  async getTransactionsEmbarqueDirecto(
    blItemGkeys: number[],
  ): Promise<TransactionResult[]> {
    // TODO: Implement when query is ready
    this.logger.warn('EMBARQUE_DIRECTO transactions not yet implemented');
    return [];
  }

  async getTransactionsDescarga(
    blItemGkeys: number[],
  ): Promise<TransactionResult[]> {
    // TODO: Implement when query is ready
    this.logger.warn('DESCARGA transactions not yet implemented');
    return [];
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

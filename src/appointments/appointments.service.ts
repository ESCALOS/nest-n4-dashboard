import { Injectable, Logger } from '@nestjs/common';
import { N4Service } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../common/constants/cache-keys.constant';
import {
  AppointmentResult,
  type AppointmentStageResult,
} from '../database/n4/n4.interfaces';
import type { PendingAppointmentResult } from '../database/n4/n4.interfaces';
import {
  AppointmentInProgressDto,
  AppointmentsResponseDto,
} from './dto/appointment-in-progress.dto';
import {
  PendingAppointmentsResponseDto,
  type AppointmentEstado,
  PendingAppointmentDto,
} from './dto/pending-appointment.dto';

type AppointmentStageTimestamps = {
  Tranquera: Date | null;
  PreGate: Date | null;
  GateIn: Date | null;
  Yard: Date | null;
};

type AppointmentStageCachePayload = {
  stage: string;
} & AppointmentStageTimestamps;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly n4Service: N4Service,
    private readonly redisService: RedisService,
  ) { }

  /**
   * Get appointments in progress from cache
   * Data is populated by background job every 30 seconds
   */
  async getAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    const cacheKey = CACHE_KEYS.appointmentsInProgress;

    // Get from cache (populated by background job)
    const cached =
      await this.redisService.getJson<AppointmentsResponseDto>(cacheKey);

    if (cached) {
      return cached;
    }

    // If not in cache, fetch directly (first request or cache miss)
    return this.fetchAndCacheAppointments();
  }

  /**
   * Fetch appointments from N4 and cache them
   * Called by background job and on cache miss
   */
  async fetchAndCacheAppointments(): Promise<AppointmentsResponseDto> {
    const results = await this.n4Service.getAppointmentsInProgress();
    const [
      vesselNamesByCarrierVisit,
      orderInfoByOrderGkey,
      stageTimestampsByTranGkey,
    ] = await Promise.all([
      this.resolveVesselNamesByCarrierVisit(results),
      this.resolveOrderInfoByOrderGkey(results),
      this.resolveStageTimestamps(results),
    ]);

    const appointments: AppointmentInProgressDto[] = results
      .map((r) =>
        this.mapAppointment(
          r,
          vesselNamesByCarrierVisit,
          orderInfoByOrderGkey,
          stageTimestampsByTranGkey,
        ),
      )
      .sort((a, b) => {
        // Últimas actualizaciones primero (por fecha de stage actual, desc)
        const dateA = a.fechaStage ? new Date(a.fechaStage).getTime() : 0;
        const dateB = b.fechaStage ? new Date(b.fechaStage).getTime() : 0;
        return dateB - dateA;
      });

    const response: AppointmentsResponseDto = {
      data: appointments,
      count: appointments.length,
      timestamp: new Date(),
    };

    // Cache the results
    const cacheKey = CACHE_KEYS.appointmentsInProgress;
    await this.redisService.setJson(cacheKey, response);

    this.logger.debug(`Cached ${appointments.length} appointments in progress`);

    return response;
  }

  // ============================================
  // PENDING APPOINTMENTS
  // ============================================

  /**
   * Get pending appointments from cache
   */
  async getPendingAppointments(): Promise<PendingAppointmentsResponseDto> {
    const cacheKey = CACHE_KEYS.pendingAppointments;

    const cached =
      await this.redisService.getJson<PendingAppointmentsResponseDto>(cacheKey);

    if (cached) {
      return cached;
    }

    return this.fetchAndCachePendingAppointments();
  }

  /**
   * Fetch pending appointments from N4 and cache them.
   * Estado is recalculated on every refresh so colors update in real-time.
   */
  async fetchAndCachePendingAppointments(): Promise<PendingAppointmentsResponseDto> {
    const results = await this.n4Service.getPendingAppointments();
    const vesselNamesByCarrierVisit =
      await this.resolveVesselNamesByCarrierVisit(results);
    const orderInfoByOrderGkey =
      await this.resolveOrderInfoByOrderGkey(results);

    const appointments: PendingAppointmentDto[] = results
      .map((r) =>
        this.mapPendingAppointment(r, vesselNamesByCarrierVisit, orderInfoByOrderGkey),
      )
      .sort((a, b) => {
        // Ordenar por fecha ascendente (próximas primero)
        const dateA = a.fechaCita ? new Date(a.fechaCita).getTime() : 0;
        const dateB = b.fechaCita ? new Date(b.fechaCita).getTime() : 0;
        return dateA - dateB;
      });

    const response: PendingAppointmentsResponseDto = {
      data: appointments,
      count: appointments.length,
      timestamp: new Date(),
    };

    const cacheKey = CACHE_KEYS.pendingAppointments;
    await this.redisService.setJson(cacheKey, response);

    this.logger.debug(`Cached ${appointments.length} pending appointments`);

    return response;
  }

  /**
   * Map raw pending appointment DB result to DTO with computed estado
   */
  private mapPendingAppointment(
    r: PendingAppointmentResult,
    vesselNamesByCarrierVisit: Map<number, string>,
    orderInfoByOrderGkey: Map<number, { booking: string; producto: string }>,
  ): PendingAppointmentDto {
    const vesselVisitGkey = this.normalizeGkey(r.VesselVisitGkey);
    const orderGkey = this.normalizeGkey(r.OrderGkey);

    const vesselName =
      vesselVisitGkey && vesselNamesByCarrierVisit.has(vesselVisitGkey)
        ? vesselNamesByCarrierVisit.get(vesselVisitGkey)!
        : 'N.E.';

    const orderInfo =
      orderGkey && orderInfoByOrderGkey.has(orderGkey)
        ? orderInfoByOrderGkey.get(orderGkey)!
        : { booking: 'N.E.', producto: 'N.E.' };

    return {
      cita: r.Cita,
      fechaCita: r.Fecha,
      linea: r.Linea,
      booking: orderInfo.booking,
      placa: r.Placa,
      carreta: r.Carreta,
      cliente: r.Cliente,
      tecnologia: r.Tecnologia,
      producto: orderInfo.producto,
      contenedor: r.Contenedor,
      nave: vesselName,
      tipo: r.Tipo,
      estado: this.calculateEstado(r.Fecha),
    };
  }

  /**
   * Resolve vessel labels for pending appointments using Redis cache.
   * Cache key: appointments:vessel-by-carrier-visit:{carrierVisitGkey}
   */
  private async resolveVesselNamesByCarrierVisit(
    results: Array<{ VesselVisitGkey: number | string | null }>,
  ): Promise<Map<number, string>> {
    const mapping = new Map<number, string>();

    const carrierVisitGkeys = Array.from(
      new Set(
        results
          .map((r) => this.normalizeGkey(r.VesselVisitGkey))
          .filter((v): v is number => v !== null),
      ),
    );

    if (carrierVisitGkeys.length === 0) return mapping;

    const cachePairs = await Promise.all(
      carrierVisitGkeys.map(async (gkey) => {
        const cached = await this.redisService.get(
          CACHE_KEYS.appointmentVesselByCarrierVisit(gkey),
        );
        return [gkey, cached] as const;
      }),
    );

    const missingGkeys: number[] = [];

    for (const [gkey, cached] of cachePairs) {
      if (cached) {
        mapping.set(gkey, cached);
      } else {
        missingGkeys.push(gkey);
      }
    }

    if (missingGkeys.length > 0) {
      const fetched = await this.n4Service.getVesselsByCarrierVisitGkeys(
        missingGkeys,
      );

      const writePromises: Promise<void>[] = [];

      for (const vessel of fetched) {
        const label = `${vessel.manifest_id} - ${vessel.vessel_name}`;
        mapping.set(vessel.carrier_visit_gkey, label);

        writePromises.push(
          this.redisService.set(
            CACHE_KEYS.appointmentVesselByCarrierVisit(vessel.carrier_visit_gkey),
            label,
          ),
        );
      }

      await Promise.all(writePromises);
    }

    return mapping;
  }

  /**
   * Resolve booking/product metadata for pending appointments using Redis cache.
   * Cache key: appointments:order-info:{orderGkey}
   * TTL: 3 days
   */
  private async resolveOrderInfoByOrderGkey(
    results: Array<{ OrderGkey: number | string | null }>,
  ): Promise<Map<number, { booking: string; producto: string }>> {
    const mapping = new Map<number, { booking: string; producto: string }>();

    const orderGkeys = Array.from(
      new Set(
        results
          .map((r) => this.normalizeGkey(r.OrderGkey))
          .filter((v): v is number => v !== null),
      ),
    );

    if (orderGkeys.length === 0) return mapping;

    const cachePairs = await Promise.all(
      orderGkeys.map(async (gkey) => {
        const cached = await this.redisService.getJson<{
          booking: string;
          producto: string;
        }>(CACHE_KEYS.appointmentOrderInfo(gkey));
        return [gkey, cached] as const;
      }),
    );

    const missingGkeys: number[] = [];

    for (const [gkey, cached] of cachePairs) {
      if (cached) {
        mapping.set(gkey, cached);
      } else {
        missingGkeys.push(gkey);
      }
    }

    if (missingGkeys.length > 0) {
      const fetched = await this.n4Service.getOrderInfoByOrderGkeys(missingGkeys);

      const writePromises: Promise<void>[] = [];

      for (const order of fetched) {
        const payload = {
          booking: order.booking ?? 'N.E.',
          producto: order.commodity ?? 'N.E.',
        };

        mapping.set(order.order_gkey, payload);

        writePromises.push(
          this.redisService.setJson(
            CACHE_KEYS.appointmentOrderInfo(order.order_gkey),
            payload,
            CACHE_TTL.appointmentOrderInfo,
          ),
        );
      }

      await Promise.all(writePromises);
    }

    return mapping;
  }

  /**
   * Resolve immutable stage timestamps by tran_gkey using Redis cache.
   * Cache key: appointments:stages:{tranGkey}
   * Re-fetches only when stage changes or cache miss occurs.
   */
  private async resolveStageTimestamps(
    results: AppointmentResult[],
  ): Promise<Map<string, AppointmentStageTimestamps>> {
    const mapping = new Map<string, AppointmentStageTimestamps>();
    const resultByTranGkey = new Map<string, AppointmentResult>();

    for (const row of results) {
      const tranGkey = this.normalizeBigintKey(row.TranGkey);
      if (!tranGkey) continue;

      if (!resultByTranGkey.has(tranGkey)) {
        resultByTranGkey.set(tranGkey, row);
      }
    }

    if (resultByTranGkey.size === 0) {
      return mapping;
    }

    const tranGkeys = Array.from(resultByTranGkey.keys());

    const cachedPairs = await Promise.all(
      tranGkeys.map(async (tranGkey) => {
        const cached =
          await this.redisService.getJson<AppointmentStageCachePayload>(
            CACHE_KEYS.appointmentStages(tranGkey),
          );
        return [tranGkey, cached] as const;
      }),
    );

    const missingTranGkeys: string[] = [];

    for (const [tranGkey, cached] of cachedPairs) {
      const row = resultByTranGkey.get(tranGkey);
      if (!row) continue;

      const currentStage = this.normalizeStage(row.Stage);

      if (cached && this.normalizeStage(cached.stage) === currentStage) {
        const cachedTimestamps: AppointmentStageTimestamps = {
          Tranquera: this.normalizeDate(cached.Tranquera),
          PreGate: this.normalizeDate(cached.PreGate),
          GateIn: this.normalizeDate(cached.GateIn),
          Yard: this.normalizeDate(cached.Yard),
        };

        if (!this.shouldRefetchStageTimestamps(currentStage, cachedTimestamps)) {
          mapping.set(tranGkey, cachedTimestamps);
          continue;
        }
      }

      missingTranGkeys.push(tranGkey);
    }

    const uniqueMissingTranGkeys = Array.from(new Set(missingTranGkeys));

    if (uniqueMissingTranGkeys.length === 0) {
      return mapping;
    }

    const fetchedStages = await this.n4Service.getAppointmentStagesByTranGkeys(
      uniqueMissingTranGkeys,
    );

    const fetchedByTranGkey = new Map<string, AppointmentStageResult>();

    for (const fetchedStage of fetchedStages) {
      const tranGkey = this.getStageField(fetchedStage, 'TranGkey', 'tran_gkey');
      const normalizedTranGkey = this.normalizeBigintKey(tranGkey);
      if (!normalizedTranGkey) continue;
      fetchedByTranGkey.set(normalizedTranGkey, fetchedStage);
    }

    const writePromises: Promise<void>[] = [];

    for (const tranGkey of uniqueMissingTranGkeys) {
      const row = resultByTranGkey.get(tranGkey);
      if (!row) continue;

      const fetched = fetchedByTranGkey.get(tranGkey);
      const timestamps: AppointmentStageTimestamps = {
        Tranquera: this.normalizeDate(
          this.getStageField(fetched, 'Tranquera', 'tranquera') ??
          row.Tranquera ??
          null,
        ),
        PreGate: this.normalizeDate(
          this.getStageField(fetched, 'PreGate', 'pregate', 'pre_gate') ??
          row.PreGate ??
          null,
        ),
        GateIn: this.normalizeDate(
          this.getStageField(fetched, 'GateIn', 'gatein', 'gate_in') ??
          row.GateIn ??
          null,
        ),
        Yard: this.normalizeDate(
          this.getStageField(fetched, 'Yard', 'yard') ??
          row.Yard ??
          null,
        ),
      };

      mapping.set(tranGkey, timestamps);

      const payload: AppointmentStageCachePayload = {
        stage: this.normalizeStage(row.Stage),
        ...timestamps,
      };

      writePromises.push(
        this.redisService.setJson(
          CACHE_KEYS.appointmentStages(tranGkey),
          payload,
          CACHE_TTL.appointmentStages,
        ),
      );
    }

    await Promise.all(writePromises);

    return mapping;
  }

  /**
   * Calcula el estado de una cita próxima basándose en la ventana de ±2 horas:
   * - vencida: now > fecha + 2h (ya pasó la ventana de atención)
   * - activa: fecha - 2h <= now <= fecha + 2h (dentro del rango de atención)
   * - pendiente: now < fecha - 2h (aún no llega su turno)
   */
  private calculateEstado(fecha: Date | null): AppointmentEstado {
    if (!fecha) return 'pendiente';

    const now = Date.now();
    const fechaMs = new Date(fecha).getTime();
    const twoHoursMs = 2 * 60 * 60 * 1000;

    if (now > fechaMs + twoHoursMs) return 'vencida';
    if (now >= fechaMs - twoHoursMs) return 'activa';
    return 'pendiente';
  }

  /**
   * Map raw DB result to DTO with computed fields:
   * - fechaStage: fecha del stage actual
   * - tiempo: diferencia en minutos entre ahora y la fecha del pre-gate (si está en pre_gate o stages posteriores), o entre ahora y la fecha del stage actual (si está en tranquera)
   */
  private mapAppointment(
    r: AppointmentResult,
    vesselNamesByCarrierVisit: Map<number, string>,
    orderInfoByOrderGkey: Map<number, { booking: string; producto: string }>,
    stageTimestampsByTranGkey: Map<string, AppointmentStageTimestamps>,
  ): AppointmentInProgressDto {
    const tranGkey = this.normalizeBigintKey(r.TranGkey);
    const cachedStageTimestamps =
      tranGkey !== null ? stageTimestampsByTranGkey.get(tranGkey) : undefined;

    const stageTimestamps: AppointmentStageTimestamps =
      cachedStageTimestamps ?? {
        Tranquera: this.normalizeDate(r.Tranquera ?? null),
        PreGate: this.normalizeDate(r.PreGate ?? null),
        GateIn: this.normalizeDate(r.GateIn ?? null),
        Yard: this.normalizeDate(r.Yard ?? null),
      };

    const normalizedStage = this.normalizeStage(r.Stage);
    const stageDate = this.getStageDateForCurrentStage(normalizedStage, stageTimestamps);
    const now = new Date();
    const vesselVisitGkey = this.normalizeGkey(r.VesselVisitGkey);
    const orderGkey = this.normalizeGkey(r.OrderGkey);

    const vesselName =
      vesselVisitGkey && vesselNamesByCarrierVisit.has(vesselVisitGkey)
        ? vesselNamesByCarrierVisit.get(vesselVisitGkey)!
        : r.Nave ?? 'N.E.';

    const orderInfo =
      orderGkey && orderInfoByOrderGkey.has(orderGkey)
        ? orderInfoByOrderGkey.get(orderGkey)!
        : { booking: r.Booking ?? 'N.E.', producto: r.Producto ?? 'N.E.' };


    const tiempoMin = stageDate
      ? normalizedStage === 'tranquera'
        ? Math.floor((now.getTime() - new Date(stageDate).getTime()) / 60000)
        : stageTimestamps.PreGate
          ? Math.floor((now.getTime() - new Date(stageTimestamps.PreGate).getTime()) / 60000)
          : null
      : null;

    return {
      cita: r.Cita,
      fechaCita: r.Fecha,
      fechaStage: stageDate,
      fechaPreGate: stageTimestamps.PreGate,
      fechaGateIn: stageTimestamps.GateIn,
      stage: normalizedStage,
      tiempo: tiempoMin,
      linea: r.Linea,
      booking: orderInfo.booking,
      placa: r.Placa,
      cliente: r.Cliente,
      tecnologia: r.Tecnologia,
      producto: orderInfo.producto,
      contenedor: r.Contenedor,
      nave: vesselName,
      carreta: r.Carreta,
      tipo: r.Tipo,
      puertoDescarga: r.PuertoDescarga ?? null,
    };
  }

  private shouldRefetchStageTimestamps(
    stage: string,
    timestamps: AppointmentStageTimestamps,
  ): boolean {
    switch (this.normalizeStage(stage)) {
      case 'tranquera':
        return timestamps.Tranquera === null;
      case 'pre_gate':
        return timestamps.PreGate === null;
      case 'gate_in':
      case 'ingate':
        return timestamps.GateIn === null;
      case 'yard':
        return timestamps.Yard === null;
      default:
        return false;
    }
  }

  /**
   * Determina la fecha del stage actual.
   * Los stages son (en orden): tranquera → pre_gate → gate_in → yard
   * Se retorna la fecha correspondiente al stage actual.
   */
  private getStageDateForCurrentStage(
    stage: string,
    timestamps: AppointmentStageTimestamps,
  ): Date | null {
    switch (stage) {
      case 'tranquera':
        return timestamps.Tranquera;
      case 'pre_gate':
        return timestamps.PreGate;
      case 'gate_in':
      case 'ingate':
        return timestamps.GateIn;
      case 'yard':
        return timestamps.Yard;
      default:
        // Fallback: la fecha más reciente disponible
        return (
          timestamps.Yard ??
          timestamps.GateIn ??
          timestamps.PreGate ??
          timestamps.Tranquera ??
          null
        );
    }
  }

  private normalizeStage(stage: string | null | undefined): string {
    if (!stage) return '';
    if (stage === 'pre-gate') return 'pre_gate';
    if (stage === 'ingate') return 'gate_in';
    return stage;
  }

  private normalizeDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    const parsed = new Date(value as string | number);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * SQL BIGINT can be returned as string by driver.
   * Normalize to positive number, otherwise null.
   */
  private normalizeGkey(value: unknown): number | null {
    if (typeof value === 'bigint' && value > 0n) {
      const asNumber = Number(value);
      return Number.isSafeInteger(asNumber) ? asNumber : null;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private normalizeBigintKey(value: unknown): string | null {
    if (typeof value === 'bigint') {
      return value > 0n ? value.toString() : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return String(Math.trunc(value));
    }

    return null;
  }

  private getStageField(
    stageRow: AppointmentStageResult | undefined,
    ...keys: string[]
  ): unknown {
    if (!stageRow) return undefined;
    const rowAsRecord = stageRow as unknown as Record<string, unknown>;

    for (const key of keys) {
      if (key in rowAsRecord) {
        return rowAsRecord[key];
      }
    }

    return undefined;
  }
}

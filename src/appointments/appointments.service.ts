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
  ZonaEspera: Date | null;
  InicioCarguio: Date | null;
  Yard: Date | null;
  GateOut: Date | null;
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

  async getGeneralCargoAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    const cacheKey = CACHE_KEYS.generalCargoAppointmentsInProgress;

    const cached =
      await this.redisService.getJson<AppointmentsResponseDto>(cacheKey);

    if (cached) {
      return cached;
    }

    return this.fetchAndCacheGeneralCargoAppointments();
  }

  async fetchAndCacheGeneralCargoAppointments(): Promise<AppointmentsResponseDto> {
    const results = await this.n4Service.getGeneralCargoAppointmentsInProgress();
    const [
      vesselNamesByCarrierVisit,
      blItemInfoByGkey,
      stageTimestampsByTranGkey,
    ] = await Promise.all([
      this.resolveVesselNamesByCarrierVisit(results),
      this.resolveBlItemInfoByBlItemGkey(results),
      this.resolveStageTimestamps(results),
    ]);

    const appointments: AppointmentInProgressDto[] = results
      .map((r) =>
        this.mapGeneralCargoAppointment(
          r,
          vesselNamesByCarrierVisit,
          blItemInfoByGkey,
          stageTimestampsByTranGkey,
        ),
      )
      .sort((a, b) => {
        const dateA = a.fechaStage ? new Date(a.fechaStage).getTime() : 0;
        const dateB = b.fechaStage ? new Date(b.fechaStage).getTime() : 0;
        return dateB - dateA;
      });

    const response: AppointmentsResponseDto = {
      data: appointments,
      count: appointments.length,
      timestamp: new Date(),
    };

    await this.redisService.setJson(
      CACHE_KEYS.generalCargoAppointmentsInProgress,
      response,
    );

    this.logger.debug(`Cached ${appointments.length} general cargo appointments in progress`);

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
    vesselNamesByCarrierVisit: Map<number, { label: string; lineId: string | null }>,
    orderInfoByOrderGkey: Map<number, { booking: string; producto: string }>,
  ): PendingAppointmentDto {
    const vesselVisitGkey = this.normalizeGkey(r.VesselVisitGkey);
    const orderGkey = this.normalizeGkey(r.OrderGkey);

    const vesselInfo =
      vesselVisitGkey && vesselNamesByCarrierVisit.has(vesselVisitGkey)
        ? vesselNamesByCarrierVisit.get(vesselVisitGkey)!
        : null;
    const vesselName = vesselInfo?.label ?? 'N.E.';

    const orderInfo =
      orderGkey && orderInfoByOrderGkey.has(orderGkey)
        ? orderInfoByOrderGkey.get(orderGkey)!
        : { booking: 'N.E.', producto: 'N.E.' };

    return {
      cita: r.Cita,
      fechaCita: r.Fecha,
      linea: vesselInfo?.lineId ?? 'N.E.',
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
    results: Array<{ VesselVisitGkey?: number | string | null }>,
  ): Promise<Map<number, { label: string; lineId: string | null }>> {
    const mapping = new Map<number, { label: string; lineId: string | null }>();

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
        const cached = await this.redisService.getJson<{ label: string; lineId: string | null }>(
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
        const lineId = vessel.line_id ?? null;
        const vesselInfo = { label, lineId };
        mapping.set(vessel.carrier_visit_gkey, vesselInfo);

        writePromises.push(
          this.redisService.setJson(
            CACHE_KEYS.appointmentVesselByCarrierVisit(vessel.carrier_visit_gkey),
            vesselInfo,
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
    results: Array<{ OrderGkey?: number | string | null }>,
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
   * Resolve permiso/producto metadata for in-progress general cargo appointments.
   * Cache key: appointments:blitem-info:{blItemGkey}
   * TTL: 3 days
   */
  private async resolveBlItemInfoByBlItemGkey(
    results: Array<{ BlItemGkey?: number | string | null }>,
  ): Promise<Map<number, { permiso: string; producto: string; cliente: string }>> {
    const mapping = new Map<number, { permiso: string; producto: string; cliente: string }>();

    const blItemGkeys = Array.from(
      new Set(
        results
          .map((r) => this.normalizeGkey(r.BlItemGkey))
          .filter((v): v is number => v !== null),
      ),
    );

    if (blItemGkeys.length === 0) return mapping;

    const cachePairs = await Promise.all(
      blItemGkeys.map(async (gkey) => {
        const cached = await this.redisService.getJson<{
          permiso: string;
          producto: string;
          cliente: string;
        }>(CACHE_KEYS.appointmentBlItemInfo(gkey));
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
      const fetched = await this.n4Service.getBlItemInfoByBlItemGkeys(missingGkeys);
      const writePromises: Promise<void>[] = [];

      for (const blItem of fetched) {
        const payload = {
          permiso: blItem.permiso ?? 'N.E.',
          producto: blItem.commodity ?? 'N.E.',
          cliente: blItem.cliente ?? 'N.E.',
        };

        mapping.set(blItem.bl_item_gkey, payload);

        writePromises.push(
          this.redisService.setJson(
            CACHE_KEYS.appointmentBlItemInfo(blItem.bl_item_gkey),
            payload,
            CACHE_TTL.appointmentBlItemInfo,
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
          ZonaEspera: this.normalizeDate(cached.ZonaEspera),
          InicioCarguio: this.normalizeDate(cached.InicioCarguio),
          Yard: this.normalizeDate(cached.Yard),
          GateOut: this.normalizeDate(cached.GateOut),
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
        ZonaEspera: this.normalizeDate(
          this.getStageField(
            fetched,
            'ZonaEspera',
            'zonaespera',
            'zona_de_espera',
            'zona-espera',
          ) ??
          row.ZonaEspera ??
          null,
        ),
        InicioCarguio: this.normalizeDate(
          this.getStageField(
            fetched,
            'InicioCarguio',
            'iniciocarguio',
            'inicio_de_carguio',
            'inicio-carguio',
            'inicio_carguio',
          ) ??
          row.InicioCarguio ??
          null,
        ),
        Yard: this.normalizeDate(
          this.getStageField(fetched, 'Yard', 'yard') ??
          row.Yard ??
          null,
        ),
        GateOut: this.normalizeDate(
          this.getStageField(fetched, 'GateOut', 'gateout', 'gate_out') ??
          row.GateOut ??
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
    vesselNamesByCarrierVisit: Map<number, { label: string; lineId: string | null }>,
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
        ZonaEspera: this.normalizeDate(r.ZonaEspera ?? null),
        InicioCarguio: this.normalizeDate(r.InicioCarguio ?? null),
        Yard: this.normalizeDate(r.Yard ?? null),
        GateOut: this.normalizeDate(r.GateOut ?? null),
      };

    const normalizedStage = this.normalizeStage(r.Stage);
    const stageDate = this.getStageDateForCurrentStage(normalizedStage, stageTimestamps);
    const vesselVisitGkey = this.normalizeGkey(r.VesselVisitGkey);
    const orderGkey = this.normalizeGkey(r.OrderGkey);

    const vesselInfo =
      vesselVisitGkey && vesselNamesByCarrierVisit.has(vesselVisitGkey)
        ? vesselNamesByCarrierVisit.get(vesselVisitGkey)!
        : null;
    const vesselName = vesselInfo?.label ?? r.Nave ?? 'N.E.';

    const orderInfo =
      orderGkey && orderInfoByOrderGkey.has(orderGkey)
        ? orderInfoByOrderGkey.get(orderGkey)!
        : { booking: r.Booking ?? 'N.E.', producto: r.Producto ?? 'N.E.' };

    const tiempoMin = stageDate
      ? normalizedStage === 'tranquera'
        ? this.elapsedMinutesSince(stageDate)
        : this.elapsedMinutesSince(stageTimestamps.PreGate)
      : null;

    return {
      cita: r.Cita ?? this.normalizeBigintKey(r.TranGkey) ?? 'N.E.',
      fechaCita: r.Fecha ?? null,
      fechaStage: stageDate,
      fechaPreGate: stageTimestamps.PreGate,
      fechaGateIn: stageTimestamps.GateIn,
      fechaZonaEspera: stageTimestamps.ZonaEspera,
      fechaInicioCarguio: stageTimestamps.InicioCarguio,
      fechaYard: stageTimestamps.Yard,
      fechaGateOut: stageTimestamps.GateOut,
      stage: normalizedStage,
      tiempo: tiempoMin,
      tiempoGateIn: this.elapsedMinutesSince(stageTimestamps.GateIn),
      deducibleEsperaInicioCarguio: 0,
      deducibleInicioCarguioTermino: 0,
      tiempoEfectivo: tiempoMin,
      linea: vesselInfo?.lineId ?? 'N.E.',
      booking: orderInfo.booking,
      permiso: 'N.E.',
      placa: r.Placa ?? '',
      tracto: r.Tracto ?? r.Placa ?? '',
      cliente: r.Cliente ?? 'N.E.',
      tecnologia: r.Tecnologia ?? 'N.E.',
      producto: orderInfo.producto,
      contenedor: r.Contenedor ?? 'N.E.',
      nave: vesselName,
      carreta: r.Carreta ?? '',
      chassis: r.Chassis ?? r.Carreta ?? '',
      tipo: r.Tipo ?? 'N.E.',
      tipoOperativa: r.Tipo ?? 'N.E.',
      puertoDescarga: r.PuertoDescarga ?? null,
    };
  }

  private mapGeneralCargoAppointment(
    r: AppointmentResult,
    vesselNamesByCarrierVisit: Map<number, { label: string; lineId: string | null }>,
    blItemInfoByGkey: Map<number, { permiso: string; producto: string; cliente: string }>,
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
        ZonaEspera: this.normalizeDate(r.ZonaEspera ?? null),
        InicioCarguio: this.normalizeDate(r.InicioCarguio ?? null),
        Yard: this.normalizeDate(r.Yard ?? null),
        GateOut: this.normalizeDate(r.GateOut ?? null),
      };

    const normalizedStage = this.normalizeStage(r.Stage);
    const stageDate = this.getStageDateForCurrentStage(normalizedStage, stageTimestamps);
    const vesselVisitGkey = this.normalizeGkey(r.VesselVisitGkey);
    const blItemGkey = this.normalizeGkey(r.BlItemGkey);

    const vesselInfo =
      vesselVisitGkey && vesselNamesByCarrierVisit.has(vesselVisitGkey)
        ? vesselNamesByCarrierVisit.get(vesselVisitGkey)!
        : null;
    const vesselName = vesselInfo?.label ?? r.Nave ?? 'N.E.';

    const blItemInfo =
      blItemGkey && blItemInfoByGkey.has(blItemGkey)
        ? blItemInfoByGkey.get(blItemGkey)!
        : { permiso: 'N.E.', producto: r.Producto ?? 'N.E.', cliente: r.Cliente ?? 'N.E.' };

    const tiempoGateIn = this.elapsedMinutesSince(stageTimestamps.GateIn);

    // Calcular deducibles con soporte a tiempo dinámico en stages activos
    const deducibleEsperaInicioCarguio = this.calculateDeductible(
      stageTimestamps.ZonaEspera,
      stageTimestamps.InicioCarguio,
      normalizedStage === 'zona_de_espera', // Si estamos en zona de espera y no hay InicioCarguio, usar ahora
    );

    const deducibleInicioCarguioTermino = this.calculateDeductible(
      stageTimestamps.InicioCarguio,
      stageTimestamps.Yard,
      normalizedStage === 'inicio_de_carguio' || normalizedStage === 'inicio_carguio', // Si estamos en inicio carguio y no hay Yard, usar ahora
    );

    const tiempoEfectivo =
      tiempoGateIn === null
        ? null
        : Math.max(
          tiempoGateIn - deducibleEsperaInicioCarguio - deducibleInicioCarguioTermino,
          0,
        );

    return {
      codigo: r.codigo ?? this.normalizeBigintKey(r.TranGkey) ?? 'N.E.',
      cita:
        r.Cita ??
        r.codigo ??
        this.normalizeBigintKey(r.TranGkey) ??
        'N.E.',
      fechaCita: r.Fecha ?? null,
      fechaStage: stageDate,
      fechaPreGate: stageTimestamps.PreGate,
      fechaGateIn: stageTimestamps.GateIn,
      fechaZonaEspera: stageTimestamps.ZonaEspera,
      fechaInicioCarguio: stageTimestamps.InicioCarguio,
      fechaYard: stageTimestamps.Yard,
      fechaGateOut: stageTimestamps.GateOut,
      stage: normalizedStage,
      tiempo: tiempoEfectivo,
      tiempoGateIn,
      deducibleEsperaInicioCarguio,
      deducibleInicioCarguioTermino,
      tiempoEfectivo,
      linea: vesselInfo?.lineId ?? 'N.E.',
      booking: blItemInfo.permiso,
      permiso: blItemInfo.permiso,
      placa: r.Placa ?? '',
      tracto: r.Tracto ?? r.Placa ?? '',
      cliente: blItemInfo.cliente,
      tecnologia: r.Tecnologia ?? 'N.E.',
      producto: blItemInfo.producto,
      contenedor: r.Contenedor ?? 'N.E.',
      nave: vesselName,
      carreta: r.Carreta ?? '',
      chassis: r.Chassis ?? r.Carreta ?? '',
      tipo: r.TipoOperativa ?? r.Tipo ?? 'N.E.',
      tipoOperativa: r.TipoOperativa ?? r.Tipo ?? 'N.E.',
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
      case 'zona_de_espera':
        return timestamps.ZonaEspera === null;
      case 'inicio_de_carguio':
      case 'inicio_carguio':
        return timestamps.InicioCarguio === null;
      case 'yard':
        return timestamps.Yard === null;
      case 'gate_out':
        return timestamps.GateOut === null;
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
      case 'zona_de_espera':
        return timestamps.ZonaEspera;
      case 'inicio_de_carguio':
      case 'inicio_carguio':
        return timestamps.InicioCarguio;
      case 'yard':
        return timestamps.Yard;
      case 'gate_out':
        return timestamps.GateOut;
      default:
        // Fallback: la fecha más reciente disponible
        return (
          timestamps.GateOut ??
          timestamps.Yard ??
          timestamps.InicioCarguio ??
          timestamps.ZonaEspera ??
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
    if (stage === 'zona-espera' || stage === 'zona espera') return 'zona_de_espera';
    if (stage === 'inicio-carguio') return 'inicio_de_carguio';
    return stage;
  }

  private elapsedMinutesSince(start: Date | null): number | null {
    if (!start) return null;
    const diff = Date.now() - start.getTime();
    if (diff < 0) return null;
    return Math.floor(diff / 60000);
  }

  private minutesBetween(start: Date | null, end: Date | null): number {
    if (!start || !end) return 0;
    const diff = end.getTime() - start.getTime();
    if (diff <= 0) return 0;
    return Math.floor(diff / 60000);
  }

  /**
   * Calcula deducible entre dos fechas.
   * Si isActiveStage es true y end es null, usa la fecha actual como referencia.
   * Útil para calcular tiempo acumulado en stages activos (zona de espera, inicio carguio).
   */
  private calculateDeductible(
    start: Date | null,
    end: Date | null,
    isActiveStage: boolean,
  ): number {
    if (!start) return 0;

    // Si estamos en un stage activo y no existe la fecha final, usar ahora
    if (isActiveStage && !end) {
      const diff = Date.now() - start.getTime();
      if (diff <= 0) return 0;
      return Math.floor(diff / 60000);
    }

    // Caso normal: calcular entre dos fechas existentes
    return this.minutesBetween(start, end);
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

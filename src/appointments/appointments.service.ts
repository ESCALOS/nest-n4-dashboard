import { Injectable, Logger } from '@nestjs/common';
import { N4Service } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../common/constants/cache-keys.constant';
import { AppointmentResult } from '../database/n4/n4.interfaces';
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
    const vesselNamesByCarrierVisit =
      await this.resolveVesselNamesByCarrierVisit(results);
    const orderInfoByOrderGkey =
      await this.resolveOrderInfoByOrderGkey(results);

    const appointments: AppointmentInProgressDto[] = results
      .map((r) =>
        this.mapAppointment(r, vesselNamesByCarrierVisit, orderInfoByOrderGkey),
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

    const missingGkeys: number[] = [];

    for (const gkey of carrierVisitGkeys) {
      const cached = await this.redisService.get(
        CACHE_KEYS.appointmentVesselByCarrierVisit(gkey),
      );

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

      for (const vessel of fetched) {
        const label = `${vessel.manifest_id} - ${vessel.vessel_name}`;
        mapping.set(vessel.carrier_visit_gkey, label);

        await this.redisService.set(
          CACHE_KEYS.appointmentVesselByCarrierVisit(vessel.carrier_visit_gkey),
          label,
        );
      }
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

    const missingGkeys: number[] = [];

    for (const gkey of orderGkeys) {
      const cached = await this.redisService.getJson<{
        booking: string;
        producto: string;
      }>(CACHE_KEYS.appointmentOrderInfo(gkey));

      if (cached) {
        mapping.set(gkey, cached);
      } else {
        missingGkeys.push(gkey);
      }
    }

    if (missingGkeys.length > 0) {
      const fetched = await this.n4Service.getOrderInfoByOrderGkeys(missingGkeys);

      for (const order of fetched) {
        const payload = {
          booking: order.booking ?? 'N.E.',
          producto: order.commodity ?? 'N.E.',
        };

        mapping.set(order.order_gkey, payload);

        await this.redisService.setJson(
          CACHE_KEYS.appointmentOrderInfo(order.order_gkey),
          payload,
          CACHE_TTL.appointmentOrderInfo,
        );
      }
    }

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
  ): AppointmentInProgressDto {
    const stageDate = this.getStageDateForCurrentStage(r);
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
      ? r.Stage === 'tranquera'
        ? Math.floor((now.getTime() - new Date(stageDate).getTime()) / 60000)
        : r.PreGate
          ? Math.floor((now.getTime() - new Date(r.PreGate).getTime()) / 60000)
          : null
      : null;

    return {
      cita: r.Cita,
      fechaCita: r.Fecha,
      fechaStage: stageDate,
      fechaPreGate: r.PreGate,
      fechaGateIn: r.GateIn,
      stage: r.Stage,
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
      tiempoEir: r.TiempoEir ?? null,
      puertoDescarga: r.PuertoDescarga ?? null,
    };
  }

  /**
   * Determina la fecha del stage actual.
   * Los stages son (en orden): tranquera → pre_gate → gate_in → yard
   * Se retorna la fecha correspondiente al stage actual.
   */
  private getStageDateForCurrentStage(r: AppointmentResult): Date | null {
    switch (r.Stage) {
      case 'tranquera':
        return r.Tranquera;
      case 'pre_gate':
        return r.PreGate;
      case 'gate_in':
      case 'ingate':
        return r.GateIn;
      case 'yard':
        return r.Yard;
      default:
        // Fallback: la fecha más reciente disponible
        return r.Yard ?? r.GateIn ?? r.PreGate ?? r.Tranquera ?? null;
    }
  }

  /**
   * SQL BIGINT can be returned as string by driver.
   * Normalize to positive number, otherwise null.
   */
  private normalizeGkey(value: unknown): number | null {
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
}

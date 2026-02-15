import { Injectable, Logger } from '@nestjs/common';
import { N4Service } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';
import { AppointmentResult } from '../database/n4/n4.interfaces';
import {
  AppointmentInProgressDto,
  AppointmentsResponseDto,
} from './dto/appointment-in-progress.dto';

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

    const appointments: AppointmentInProgressDto[] = results
      .map((r) => this.mapAppointment(r))
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

  /**
   * Map raw DB result to DTO with computed fields:
   * - fechaStage: fecha del stage actual
   * - tiempo: diferencia en minutos entre ahora y la fecha del stage actual
   */
  private mapAppointment(r: AppointmentResult): AppointmentInProgressDto {
    const stageDate = this.getStageDateForCurrentStage(r);
    const now = new Date();
    const tiempoMin = stageDate
      ? Math.floor((now.getTime() - new Date(stageDate).getTime()) / 60000)
      : null;

    return {
      cita: r.Cita,
      fechaCita: r.Fecha,
      fechaStage: stageDate,
      stage: r.Stage,
      tiempo: tiempoMin,
      linea: r.Linea,
      booking: r.Booking,
      placa: r.Placa,
      cliente: r.Cliente,
      tecnologia: r.Tecnologia,
      producto: r.Producto,
      contenedor: r.Contenedor,
      nave: r.Nave,
      carreta: r.Carreta,
      tipo: r.Tipo,
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
}

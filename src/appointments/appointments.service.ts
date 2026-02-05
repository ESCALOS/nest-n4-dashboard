import { Injectable, Logger } from '@nestjs/common';
import { N4Service } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';
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
  ) {}

  /**
   * Get appointments in progress from cache
   * Data is populated by background job every 5 seconds
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

    const appointments: AppointmentInProgressDto[] = results.map((r) => ({
      cita: r.Cita,
      fecha: r.Fecha,
      booking: r.Booking,
      linea: r.Linea,
      cliente: r.Cliente,
      contenedor: r.Contenedor,
      tecnologia: r.Tecnologia,
      producto: r.Producto,
      nave: r.Nave,
      placa: r.Placa,
      carreta: r.Carreta,
      stage: r.Stage,
      tranquera: r.Tranquera,
      preGate: r.PreGate,
      gateIn: r.GateIn,
      yard: r.Yard,
      tipo: r.Tipo,
    }));

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
}

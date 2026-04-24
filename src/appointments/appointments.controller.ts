import { Controller, Get, Sse, Logger, Param, UseGuards } from '@nestjs/common';
import { Observable, switchMap, startWith, finalize, interval, map, merge } from 'rxjs';
import { AppointmentsService } from './appointments.service';
import { AppointmentsEventService } from './appointments-event.service';
import { AppointmentsResponseDto } from './dto/appointment-in-progress.dto';
import { PendingAppointmentsResponseDto } from './dto/pending-appointment.dto';
import {
  AppointmentEirPrintDataDto,
  GetEirPrintDataDto,
} from './dto/get-eir-print-data.dto';
import { Public } from '../auth/decorators/public.decorator';
import { SseOneTimeTokenGuard } from '../auth/guards/sse-one-time-token.guard';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('appointments')
export class AppointmentsController {
  private readonly logger = new Logger(AppointmentsController.name);

  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly eventService: AppointmentsEventService,
  ) { }

  // ============================================
  // IN-PROGRESS ENDPOINTS
  // ============================================

  /**
   * REST endpoint — get appointments in progress
   */
  @Get('in-progress')
  async getAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    return this.appointmentsService.getAppointmentsInProgress();
  }

  /**
   * REST endpoint — get general cargo appointments in progress
   */
  @Get('in-progress/general-cargo')
  async getGeneralCargoAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    return this.appointmentsService.getGeneralCargoAppointmentsInProgress();
  }

  /**
   * REST endpoint — get EIR print data by appointment id.
   */
  @Get('in-progress/:appointmentId/eir-print-data')
  async getEirPrintData(
    @Param() params: GetEirPrintDataDto,
  ): Promise<AppointmentEirPrintDataDto> {
    return this.appointmentsService.getEirPrintData(params.appointmentId);
  }

  /**
   * REST endpoint — EIR print data test by appointment id.
   * Direct DB lookup for testing when the appointment is no longer in progress.
   */
  @Get('test/:appointmentId/eir-print-data')
  async getEirPrintDataForTesting(
    @Param() params: GetEirPrintDataDto,
  ): Promise<AppointmentEirPrintDataDto> {
    return this.appointmentsService.getEirPrintDataForTesting(params.appointmentId);
  }

  /**
   * SSE endpoint — the frontend subscribes here to receive
   * AppointmentsResponseDto every time data is refreshed.
   *
   * GET /appointments/in-progress/stream
   */
  @Public()
  @UseGuards(SseOneTimeTokenGuard)
  @Sse('in-progress/stream')
  stream(): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — appointments in progress');

    const data$ = this.eventService.refresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        new Observable<MessageEvent>((subscriber) => {
          this.appointmentsService
            .getAppointmentsInProgress()
            .then((data) => {
              subscriber.next({ data });
              subscriber.complete();
            })
            .catch((err) => {
              this.logger.error(`Error fetching appointments: ${err.message}`);
              subscriber.next({ data: { data: [], count: 0, timestamp: new Date() } });
              subscriber.complete();
            });
        }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log('SSE connection closed — appointments in progress'),
      ),
    );
  }

  /**
   * SSE endpoint — general cargo appointments in progress
   * GET /appointments/in-progress/general-cargo/stream
   */
  @Public()
  @UseGuards(SseOneTimeTokenGuard)
  @Sse('in-progress/general-cargo/stream')
  generalCargoStream(): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — general cargo appointments in progress');

    const data$ = this.eventService.refresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        new Observable<MessageEvent>((subscriber) => {
          this.appointmentsService
            .getGeneralCargoAppointmentsInProgress()
            .then((data) => {
              subscriber.next({ data });
              subscriber.complete();
            })
            .catch((err) => {
              this.logger.error(`Error fetching general cargo appointments: ${err.message}`);
              subscriber.next({ data: { data: [], count: 0, timestamp: new Date() } });
              subscriber.complete();
            });
        }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log('SSE connection closed — general cargo appointments in progress'),
      ),
    );
  }

  // ============================================
  // PENDING ENDPOINTS
  // ============================================

  /**
   * REST endpoint — get pending appointments
   */
  @Get('pending')
  async getPendingAppointments(): Promise<PendingAppointmentsResponseDto> {
    return this.appointmentsService.getPendingAppointments();
  }

  /**
   * SSE endpoint — the frontend subscribes here to receive
   * PendingAppointmentsResponseDto every time data is refreshed.
   *
   * GET /appointments/pending/stream
   */
  @Public()
  @UseGuards(SseOneTimeTokenGuard)
  @Sse('pending/stream')
  pendingStream(): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — pending appointments');

    const data$ = this.eventService.pendingRefresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        new Observable<MessageEvent>((subscriber) => {
          this.appointmentsService
            .getPendingAppointments()
            .then((data) => {
              subscriber.next({ data });
              subscriber.complete();
            })
            .catch((err) => {
              this.logger.error(`Error fetching pending appointments: ${err.message}`);
              subscriber.next({ data: { data: [], count: 0, timestamp: new Date() } });
              subscriber.complete();
            });
        }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log('SSE connection closed — pending appointments'),
      ),
    );
  }
}

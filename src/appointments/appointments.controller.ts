import { Controller, Get, Sse, Logger } from '@nestjs/common';
import { Observable, switchMap, startWith, finalize } from 'rxjs';
import { AppointmentsService } from './appointments.service';
import { AppointmentsEventService } from './appointments-event.service';
import { AppointmentsResponseDto } from './dto/appointment-in-progress.dto';
import { PendingAppointmentsResponseDto } from './dto/pending-appointment.dto';

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
   * SSE endpoint — the frontend subscribes here to receive
   * AppointmentsResponseDto every time data is refreshed.
   *
   * GET /appointments/in-progress/stream
   */
  @Sse('in-progress/stream')
  stream(): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — appointments in progress');

    return this.eventService.refresh$.pipe(
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
      finalize(() =>
        this.logger.log('SSE connection closed — appointments in progress'),
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
  @Sse('pending/stream')
  pendingStream(): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — pending appointments');

    return this.eventService.pendingRefresh$.pipe(
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
      finalize(() =>
        this.logger.log('SSE connection closed — pending appointments'),
      ),
    );
  }
}

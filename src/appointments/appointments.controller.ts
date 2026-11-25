import {
  Req,
  UnauthorizedException,
  ForbiddenException,
  Controller,
  Get,
  Sse,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  Observable,
  switchMap,
  startWith,
  finalize,
  interval,
  map,
  merge,
} from 'rxjs';
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
import { PrismaService } from '../database/prisma/prisma.service';
import { Privilege } from '@prisma/client';
import { Privileges } from '../auth/decorators/privileges.decorator';

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
    private readonly prisma: PrismaService,
    private readonly appointmentsService: AppointmentsService,
    private readonly eventService: AppointmentsEventService,
  ) {}

  private async scope(userId: string) {
    if (!userId) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new UnauthorizedException();
    return user;
  }
  private async scoped<T extends { data: { linea: string }[]; count: number }>(
    userId: string,
    fetch: () => Promise<T>,
  ): Promise<T> {
    const user = await this.scope(userId);
    const response = await fetch();
    if (user.isInternal) return response;
    const data = response.data.filter((row) =>
      (user.allowedLines as string[]).includes(row.linea),
    );
    return { ...response, data, count: data.length };
  }
  private async checkEir(userId: string, id: string) {
    const response = await this.scoped(userId, () =>
      this.appointmentsService.getAppointmentsInProgress(),
    );
    const user = await this.scope(userId);
    if (
      !user.isInternal &&
      !response.data.some((row) => row.cita === id.trim())
    )
      throw new ForbiddenException();
  }
  // ============================================
  // IN-PROGRESS ENDPOINTS
  // ============================================

  /**
   * REST endpoint — get appointments in progress
   */
  @Get('in-progress')
  @Privileges(Privilege.VIEW_IN_PROGRESS_APPOINTMENTS)
  async getAppointmentsInProgress(
    @Req() req: any,
  ): Promise<AppointmentsResponseDto> {
    return this.scoped(req.user?.userId, () =>
      this.appointmentsService.getAppointmentsInProgress(),
    );
  }

  /**
   * REST endpoint — get general cargo appointments in progress
   */
  @Get('in-progress/general-cargo')
  @Privileges(Privilege.VIEW_GENERAL_CARGO_IN_PROGRESS_APPOINTMENTS)
  async getGeneralCargoAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    return this.appointmentsService.getGeneralCargoAppointmentsInProgress();
  }

  /**
   * REST endpoint — get EIR print data by appointment id.
   */
  @Get('in-progress/:appointmentId/eir-print-data')
  @Privileges(Privilege.VIEW_IN_PROGRESS_APPOINTMENTS)
  async getEirPrintData(
    @Req() req: any,
    @Param() params: GetEirPrintDataDto,
  ): Promise<AppointmentEirPrintDataDto> {
    await this.checkEir(req.user?.userId, params.appointmentId);
    return this.appointmentsService.getEirPrintData(params.appointmentId);
  }

  /**
   * REST endpoint — EIR print data test by appointment id.
   * Direct DB lookup for testing when the appointment is no longer in progress.
   */
  @Get('test/:appointmentId/eir-print-data')
  @Privileges(Privilege.VIEW_IN_PROGRESS_APPOINTMENTS)
  async getEirPrintDataForTesting(
    @Req() req: any,
    @Param() params: GetEirPrintDataDto,
  ): Promise<AppointmentEirPrintDataDto> {
    await this.checkEir(req.user?.userId, params.appointmentId);
    return this.appointmentsService.getEirPrintDataForTesting(
      params.appointmentId,
    );
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
  @Privileges(Privilege.VIEW_IN_PROGRESS_APPOINTMENTS)
  stream(@Req() req: any): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — appointments in progress');

    const data$ = this.eventService.refresh$.pipe(
      startWith(undefined),
      switchMap(
        () =>
          new Observable<MessageEvent>((subscriber) => {
            this.scoped(req.user?.userId, () =>
              this.appointmentsService.getAppointmentsInProgress(),
            )
              .then((data) => {
                subscriber.next({ data });
                subscriber.complete();
              })
              .catch((err) => {
                this.logger.error(
                  `Error fetching appointments: ${err.message}`,
                );
                subscriber.next({
                  data: { data: [], count: 0, timestamp: new Date() },
                });
                subscriber.complete();
              });
          }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(
        () =>
          ({
            type: 'heartbeat',
            data: { timestamp: new Date().toISOString() },
          }) as MessageEvent,
      ),
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
  @Privileges(Privilege.VIEW_GENERAL_CARGO_IN_PROGRESS_APPOINTMENTS)
  generalCargoStream(): Observable<MessageEvent> {
    this.logger.log(
      'SSE connection opened — general cargo appointments in progress',
    );

    const data$ = this.eventService.refresh$.pipe(
      startWith(undefined),
      switchMap(
        () =>
          new Observable<MessageEvent>((subscriber) => {
            this.appointmentsService
              .getGeneralCargoAppointmentsInProgress()
              .then((data) => {
                subscriber.next({ data });
                subscriber.complete();
              })
              .catch((err) => {
                this.logger.error(
                  `Error fetching general cargo appointments: ${err.message}`,
                );
                subscriber.next({
                  data: { data: [], count: 0, timestamp: new Date() },
                });
                subscriber.complete();
              });
          }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(
        () =>
          ({
            type: 'heartbeat',
            data: { timestamp: new Date().toISOString() },
          }) as MessageEvent,
      ),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log(
          'SSE connection closed — general cargo appointments in progress',
        ),
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
  @Privileges(Privilege.VIEW_PENDING_APPOINTMENTS)
  async getPendingAppointments(
    @Req() req: any,
  ): Promise<PendingAppointmentsResponseDto> {
    return this.scoped(req.user?.userId, () =>
      this.appointmentsService.getPendingAppointments(),
    );
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
  @Privileges(Privilege.VIEW_PENDING_APPOINTMENTS)
  pendingStream(@Req() req: any): Observable<MessageEvent> {
    this.logger.log('SSE connection opened — pending appointments');

    const data$ = this.eventService.pendingRefresh$.pipe(
      startWith(undefined),
      switchMap(
        () =>
          new Observable<MessageEvent>((subscriber) => {
            this.scoped(req.user?.userId, () =>
              this.appointmentsService.getPendingAppointments(),
            )
              .then((data) => {
                subscriber.next({ data });
                subscriber.complete();
              })
              .catch((err) => {
                this.logger.error(
                  `Error fetching pending appointments: ${err.message}`,
                );
                subscriber.next({
                  data: { data: [], count: 0, timestamp: new Date() },
                });
                subscriber.complete();
              });
          }),
      ),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(
        () =>
          ({
            type: 'heartbeat',
            data: { timestamp: new Date().toISOString() },
          }) as MessageEvent,
      ),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log('SSE connection closed — pending appointments'),
      ),
    );
  }
}

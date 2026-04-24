import {
  Controller,
  Query,
  Post,
  Get,
  Delete,
  Body,
  Sse,
  Logger,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { Observable, switchMap, startWith, map, finalize, interval, merge } from 'rxjs';
import { GeneralCargoService } from './general-cargo.service';
import { GeneralCargoEventService } from './general-cargo-event.service';
import { OperationVesselRequestDto } from './dto/operation-vessel-request.dto';
import { MonitoringGeneralCargoResponse } from './dto/operation-vessel-response.dto';
import { SaveSspPermissionClassificationsDto } from './dto/save-ssp-permission-classifications.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { SseOneTimeTokenGuard } from '../../auth/guards/sse-one-time-token.guard';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('monitoring/general-cargo')
export class GeneralCargoController {
  private readonly logger = new Logger(GeneralCargoController.name);

  constructor(
    private readonly generalCargoService: GeneralCargoService,
    private readonly eventService: GeneralCargoEventService,
  ) { }

  /**
   * SSE endpoint — the frontend subscribes here to receive
   * MonitoringGeneralCargoResponse every time data is refreshed.
   *
   * GET /monitoring/general-cargo/stream?manifest_id=XXX&operation=STOCKPILING
   */
  @Public()
  @UseGuards(SseOneTimeTokenGuard)
  @Sse('stream')
  stream(
    @Query('manifest_id') manifest_id: string,
    @Query('operation') operation: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `SSE connection opened — manifest: ${manifest_id}, type: ${operation}`,
    );

    // Emit immediately, then on every refresh signal
    const data$ = this.eventService.refresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.fetchData(manifest_id, operation),
      ),
      map((response) => ({
        data: response,
      })),
    );

    const heartbeat$ = interval(10_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    return merge(data$, heartbeat$).pipe(
      finalize(() =>
        this.logger.log(
          `SSE connection closed — manifest: ${manifest_id}, type: ${operation}`,
        ),
      ),
    );
  }

  /**
   * SSE endpoint — clients subscribe here to receive the
   * updated list of monitored operations whenever it changes.
   *
   * GET /monitoring/general-cargo/operations/stream
   */
  @Public()
  @UseGuards(SseOneTimeTokenGuard)
  @Sse('operations/stream')
  operationsStream(): Observable<MessageEvent> {
    this.logger.log('SSE operations connection opened');

    const data$ = this.eventService.operations$.pipe(
      startWith(undefined),
      switchMap(() =>
        new Observable<MessageEvent>((subscriber) => {
          this.generalCargoService
            .getMonitoredOperations()
            .then((operations) => {
              subscriber.next({ data: operations });
              subscriber.complete();
            })
            .catch((err) => {
              this.logger.error(`Error fetching monitored operations: ${err.message}`);
              subscriber.next({ data: [] });
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
      finalize(() => this.logger.log('SSE operations connection closed')),
    );
  }

  // ============================================
  // MONITORED OPERATIONS CRUD
  // ============================================

  /**
   * Get vessels currently in WORKING phase.
   * GET /monitoring/general-cargo/working-vessels
   */
  @Get('working-vessels')
  async getWorkingVessels() {
    const vessels = await this.generalCargoService.getWorkingVessels();
    return { success: true, data: vessels };
  }

  /**
   * Register a manifest + operation_type for monitoring.
   * POST /monitoring/general-cargo/operations
   */
  @Post('operations')
  async addMonitoredOperation(
    @Body(new ValidationPipe({ transform: true }))
    body: OperationVesselRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.generalCargoService.addMonitoredOperation(
      body.manifest_id,
      body.operation_type,
    );
    this.eventService.notifyOperationsChanged();
    return {
      success: true,
      message: `Operation ${body.manifest_id}/${body.operation_type} added to monitoring`,
    };
  }

  /**
   * List all currently monitored operations.
   * GET /monitoring/general-cargo/operations
   */
  @Get('operations')
  async getMonitoredOperations() {
    const operations =
      await this.generalCargoService.getMonitoredOperations();
    return { success: true, data: operations };
  }

  /**
   * Remove a manifest + operation_type from monitoring.
   * DELETE /monitoring/general-cargo/operations
   */
  @Delete('operations')
  async removeMonitoredOperation(
    @Body(new ValidationPipe({ transform: true }))
    body: OperationVesselRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.generalCargoService.removeMonitoredOperation(
      body.manifest_id,
      body.operation_type,
    );
    this.eventService.notifyOperationsChanged();
    return {
      success: true,
      message: `Operation ${body.manifest_id}/${body.operation_type} removed from monitoring`,
    };
  }

  /**
   * Force refresh of holds (invalidate cache and re-fetch from N4).
   * POST /monitoring/general-cargo/refresh-holds
   */
  @Post('refresh-holds')
  async refreshHolds(
    @Body(new ValidationPipe({ transform: true }))
    body: OperationVesselRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.generalCargoService.refreshHolds(body.manifest_id);
    this.eventService.notifyRefresh();
    return {
      success: true,
      message: `Holds refreshed for manifest ${body.manifest_id}`,
    };
  }

  /**
   * Force refresh of BL items / services (invalidate cache and re-fetch from N4).
   * POST /monitoring/general-cargo/refresh-services
   */
  @Post('refresh-services')
  async refreshServices(
    @Body(new ValidationPipe({ transform: true }))
    body: OperationVesselRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.generalCargoService.refreshBLItems(
      body.manifest_id,
      body.operation_type,
    );
    this.eventService.notifyRefresh();
    return {
      success: true,
      message: `Services refreshed for manifest ${body.manifest_id}/${body.operation_type}`,
    };
  }

  /**
   * Obtener clasificaciones SSP actuales para operativa maíz/despacho.
   * GET /monitoring/general-cargo/ssp-permissions/classifications?manifest_id=XXX&operation_type=DISPATCHING
   */
  @Get('ssp-permissions/classifications')
  async getSspPermissionClassifications(
    @Query(new ValidationPipe({ transform: true }))
    query: OperationVesselRequestDto,
  ): Promise<{ success: boolean; data: any[] }> {
    const data = await this.generalCargoService.getSspPermissionClassifications(
      query.manifest_id,
      query.operation_type,
    );

    return { success: true, data };
  }

  /**
   * Guardar clasificaciones SSP internas/externas.
   * POST /monitoring/general-cargo/ssp-permissions/classifications
   */
  @Post('ssp-permissions/classifications')
  async saveSspPermissionClassifications(
    @Body(new ValidationPipe({ transform: true }))
    body: SaveSspPermissionClassificationsDto,
  ): Promise<{ success: boolean; message: string; data: any[] }> {
    const data = await this.generalCargoService.saveSspPermissionClassifications(
      body.manifest_id,
      body.operation_type,
      body.items,
    );

    this.eventService.notifyRefresh();

    return {
      success: true,
      message: `SSP classifications saved for manifest ${body.manifest_id}`,
      data,
    };
  }

  /**
   * Get stockpiling tickets detail
   * GET /monitoring/general-cargo/stockpiling-tickets?manifestId=2026-110&blItemGkeys=123,456,789
   */
  @Get('stockpiling-tickets')
  async getStockpilingTickets(
    @Query('manifestId') manifestId: string,
    @Query('blItemGkeys') blItemGkeys: string,
  ): Promise<{ success: boolean; data: any[] }> {
    if (!blItemGkeys) {
      return { success: true, data: [] };
    }

    const gkeys = blItemGkeys.split(',').map(Number).filter(n => !isNaN(n));
    const tickets = await this.generalCargoService.getStockpilingTickets(gkeys, manifestId);

    return { success: true, data: tickets };
  }

  /**
   * Get indirect shipment (embarque indirecto) tickets detail
   * GET /monitoring/general-cargo/indirect-shipment-tickets?manifestId=2026-110&blItemGkeys=123,456,789
   */
  @Get('indirect-shipment-tickets')
  async getIndirectShipmentTickets(
    @Query('manifestId') manifestId: string,
    @Query('blItemGkeys') blItemGkeys: string,
  ): Promise<{ success: boolean; data: any[] }> {
    if (!blItemGkeys) {
      return { success: true, data: [] };
    }

    const gkeys = blItemGkeys.split(',').map(Number).filter(n => !isNaN(n));
    const tickets = await this.generalCargoService.getIndirectShipmentTickets(gkeys, manifestId);

    return { success: true, data: tickets };
  }

  // ============================================
  // INTERNAL
  // ============================================

  private fetchData(
    manifestId: string,
    operationType: string,
  ): Observable<MonitoringGeneralCargoResponse> {
    return new Observable((subscriber) => {
      this.generalCargoService
        .getMonitoringData(manifestId, operationType as any)
        .then((data) => {
          subscriber.next(data);
          subscriber.complete();
        })
        .catch((error) => {
          this.logger.error(
            `Error fetching monitoring data for ${manifestId}/${operationType}: ${error.message}`,
            error.stack,
          );
          subscriber.next({
            success: false,
            error: error.message,
            data: null as any,
          } as any);
          subscriber.complete();
        });
    });
  }
}

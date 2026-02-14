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
} from '@nestjs/common';
import { Observable, Subject, switchMap, startWith, map, finalize } from 'rxjs';
import { GeneralCargoService } from './general-cargo.service';
import { OperationVesselRequestDto } from './dto/operation-vessel-request.dto';
import { MonitoringGeneralCargoResponse } from './dto/operation-vessel-response.dto';
import { OperationType } from './enums/operation-type.enum';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('monitoring/general-cargo')
export class GeneralCargoController {
  private readonly logger = new Logger(GeneralCargoController.name);

  /** Subject to push refresh signals from the background job */
  private readonly refreshSubject = new Subject<void>();

  constructor(private readonly generalCargoService: GeneralCargoService) { }

  /**
   * Called by the background job when transactions are refreshed.
   * Pushes a signal so all active SSE connections re-emit data.
   */
  notifyRefresh(): void {
    this.refreshSubject.next();
  }

  /**
   * SSE endpoint — the frontend subscribes here to receive
   * MonitoringGeneralCargoResponse every time data is refreshed.
   *
   * GET /monitoring/general-cargo/stream?manifest_id=XXX&operation_type=STOCKPILING
   */
  @Sse('stream')
  stream(
    @Query(new ValidationPipe({ transform: true }))
    query: OperationVesselRequestDto,
  ): Observable<MessageEvent> {
    const { manifest_id, operation_type } = query;
    this.logger.log(
      `SSE connection opened — manifest: ${manifest_id}, type: ${operation_type}`,
    );

    // Emit immediately, then on every refresh signal
    return this.refreshSubject.pipe(
      startWith(undefined),
      switchMap(() =>
        this.fetchData(manifest_id, operation_type),
      ),
      map((response) => ({
        data: response,
      })),
      finalize(() =>
        this.logger.log(
          `SSE connection closed — manifest: ${manifest_id}, type: ${operation_type}`,
        ),
      ),
    );
  }

  // ============================================
  // MONITORED OPERATIONS CRUD
  // ============================================

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
    return {
      success: true,
      message: `Operation ${body.manifest_id}/${body.operation_type} removed from monitoring`,
    };
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

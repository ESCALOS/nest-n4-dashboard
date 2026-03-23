import {
    Controller,
    Get,
    Post,
    Delete,
    Query,
    Body,
    Sse,
    Logger,
    ValidationPipe,
} from '@nestjs/common';
import { Observable, switchMap, startWith, map, finalize, interval, merge } from 'rxjs';
import { ContainersMonitoringService } from './containers-monitoring.service';
import { ContainersEventService } from './containers-event.service';
import { GetContainerMonitoringQueryDto } from './dto/get-container-monitoring-query.dto';
import { ContainerMonitoringDataDto } from './dto/container-monitoring-response.dto';

interface MessageEvent {
    data: string | object;
    id?: string;
    type?: string;
    retry?: number;
}

@Controller('monitoring/containers')
export class ContainersMonitoringController {
    private readonly logger = new Logger(ContainersMonitoringController.name);

    constructor(
        private readonly containersMonitoringService: ContainersMonitoringService,
        private readonly eventService: ContainersEventService,
    ) { }

    // ============================================
    // SSE ENDPOINTS
    // ============================================

    /**
     * SSE — stream container monitoring data for a specific manifest.
     * GET /monitoring/containers/stream?manifest_id=XXX
     */
    @Sse('stream')
    stream(
        @Query(new ValidationPipe({ transform: true }))
        query: GetContainerMonitoringQueryDto,
    ): Observable<MessageEvent> {
        const { manifest_id } = query;
        this.logger.log(`SSE connection opened — containers manifest: ${manifest_id}`);

        const data$ = this.eventService.refresh$.pipe(
            startWith(undefined),
            switchMap(() => this.fetchData(manifest_id)),
            map((response) => ({ data: response })),
        );

        const heartbeat$ = interval(10_000).pipe(
            map(() => ({
                type: 'heartbeat',
                data: { timestamp: new Date().toISOString() },
            } as MessageEvent)),
        );

        return merge(data$, heartbeat$).pipe(
            finalize(() =>
                this.logger.log(`SSE connection closed — containers manifest: ${manifest_id}`),
            ),
        );
    }

    /**
     * SSE — stream the list of monitored container vessels.
     * GET /monitoring/containers/vessels/stream
     */
    @Sse('vessels/stream')
    vesselsStream(): Observable<MessageEvent> {
        this.logger.log('SSE container vessels connection opened');

        const data$ = this.eventService.vessels$.pipe(
            startWith(undefined),
            switchMap(() =>
                new Observable<MessageEvent>((subscriber) => {
                    this.containersMonitoringService
                        .getMonitoredVessels()
                        .then((vessels) => {
                            subscriber.next({ data: vessels });
                            subscriber.complete();
                        })
                        .catch((err) => {
                            this.logger.error(`Error fetching monitored vessels: ${err.message}`);
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
            finalize(() => this.logger.log('SSE container vessels connection closed')),
        );
    }

    // ============================================
    // MONITORED VESSELS CRUD
    // ============================================

    /**
     * Get vessels currently in WORKING phase.
     * GET /monitoring/containers/working-vessels
     */
    @Get('working-vessels')
    async getWorkingVessels() {
        const vessels = await this.containersMonitoringService.getWorkingVessels();
        return { success: true, data: vessels };
    }

    /**
     * Add a vessel to container monitoring.
     * POST /monitoring/containers/vessels
     */
    @Post('vessels')
    async addVessel(
        @Body(new ValidationPipe({ transform: true }))
        body: GetContainerMonitoringQueryDto,
    ): Promise<{ success: boolean; message: string }> {
        const manifest = await this.containersMonitoringService.addMonitoredVessel(body.manifest_id);
        this.eventService.notifyVesselsChanged();
        return {
            success: true,
            message: `Vessel ${manifest.vessel_name} (${body.manifest_id}) added to container monitoring`,
        };
    }

    /**
     * List all monitored container vessels.
     * GET /monitoring/containers/vessels
     */
    @Get('vessels')
    async getVessels() {
        const vessels = await this.containersMonitoringService.getMonitoredVessels();
        return { success: true, data: vessels };
    }

    /**
     * Remove a vessel from container monitoring.
     * DELETE /monitoring/containers/vessels
     */
    @Delete('vessels')
    async removeVessel(
        @Body(new ValidationPipe({ transform: true }))
        body: GetContainerMonitoringQueryDto,
    ): Promise<{ success: boolean; message: string }> {
        await this.containersMonitoringService.removeMonitoredVessel(body.manifest_id);
        this.eventService.notifyVesselsChanged();
        return {
            success: true,
            message: `Vessel ${body.manifest_id} removed from container monitoring`,
        };
    }

    // ============================================
    // INTERNAL
    // ============================================

    private fetchData(manifestId: string): Observable<ContainerMonitoringDataDto> {
        return new Observable((subscriber) => {
            this.containersMonitoringService
                .getMonitoringData(manifestId)
                .then((data) => {
                    subscriber.next(data);
                    subscriber.complete();
                })
                .catch((error) => {
                    this.logger.error(
                        `Error fetching container data for ${manifestId}: ${error.message}`,
                        error.stack,
                    );
                    subscriber.next({
                        manifest: { id: manifestId, gkey: 0, vessel_name: 'Error' },
                        summary: {
                            total_units: 0,
                            discharge: { to_discharge: 0, discharged: 0, total: 0 },
                            load: { not_arrived: 0, to_load: 0, loaded: 0, total: 0 },
                            restow: { pending: 0, on_yard: 0, completed: 0, total: 0 },
                        },
                        pending_by_bay: { discharge: [], load: [], not_arrived: [], restow: [] },
                        containers: [],
                        last_update: new Date().toISOString(),
                    });
                    subscriber.complete();
                });
        });
    }
}

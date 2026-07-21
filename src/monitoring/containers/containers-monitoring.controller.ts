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
    UseGuards,
} from '@nestjs/common';
import { Observable, switchMap, startWith, map, finalize, interval, merge } from 'rxjs';
import { ContainersMonitoringService } from './containers-monitoring.service';
import { ContainersEventService } from './containers-event.service';
import { GetContainerByGkeyQueryDto, GetContainerMonitoringQueryDto } from './dto/get-container-monitoring-query.dto';
import { ContainerMonitoringDataDto } from './dto/container-monitoring-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { SseOneTimeTokenGuard } from '../../auth/guards/sse-one-time-token.guard';


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
     * GET /monitoring/containers/stream?carrier_visit_gkey=123
     */
    @Public()
    @UseGuards(SseOneTimeTokenGuard)
    @Sse('stream')
    stream(
        @Query(new ValidationPipe({ transform: true }))
        query: GetContainerByGkeyQueryDto,
    ): Observable<MessageEvent> {
        const { carrier_visit_gkey } = query;
        this.logger.log(`SSE connection opened for container visit ${carrier_visit_gkey}`);

        const data$ = this.eventService.refresh$.pipe(
            startWith(undefined),
            switchMap(() => this.fetchData(carrier_visit_gkey)),
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
                this.logger.log(`SSE connection closed for container visit ${carrier_visit_gkey}`),
            ),
        );
    }

    /**
     * SSE — stream the list of monitored container vessels.
     * GET /monitoring/containers/vessels/stream
     */
    @Public()
    @UseGuards(SseOneTimeTokenGuard)
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
     * Get container operations report data for Excel export.
     * GET /monitoring/containers/export-data?carrier_visit_gkey=123
     */
    @Get('export-data')
    async getExportData(
        @Query(new ValidationPipe({ transform: true }))
        query: GetContainerByGkeyQueryDto,
    ) {
        const data = await this.containersMonitoringService.getOperationsReport(query.carrier_visit_gkey);
        return { success: true, data };
    }

    /**
     * Get not-arrived containers enriched with booking metadata.
     * GET /monitoring/containers/not-arrived?carrier_visit_gkey=123
     */
    @Get('not-arrived')
    async getNotArrived(
        @Query(new ValidationPipe({ transform: true }))
        query: GetContainerByGkeyQueryDto,
    ) {
        const data = await this.containersMonitoringService.getNotArrivedContainers(query.carrier_visit_gkey);
        return { success: true, data };
    }

    @Get('booking-export-data')
    async getBookingExportData(
        @Query(new ValidationPipe({ transform: true }))
        query: GetContainerByGkeyQueryDto,
    ) {
        const data = await this.containersMonitoringService.getBookingExport(
            query.carrier_visit_gkey,
        );
        return { success: true, data };
    }

    /**
     * Remove a vessel from container monitoring.
     * DELETE /monitoring/containers/vessels
     */
    @Delete('vessels')
    async removeVessel(
        @Body(new ValidationPipe({ transform: true }))
        body: GetContainerByGkeyQueryDto,
    ): Promise<{ success: boolean; message: string }> {
        await this.containersMonitoringService.removeMonitoredVessel(body.carrier_visit_gkey);
        this.eventService.notifyVesselsChanged();
        return {
            success: true,
            message: `Vessel gkey ${body.carrier_visit_gkey} removed from container monitoring`,
        };
    }

    // ============================================
    // INTERNAL
    // ============================================

    private fetchData(carrierVisitGkey: number): Observable<ContainerMonitoringDataDto> {
        return new Observable((subscriber) => {
            this.containersMonitoringService
                .getMonitoringData(carrierVisitGkey)
                .then((data) => {
                    subscriber.next(data);
                    subscriber.complete();
                })
                .catch((error) => {
                    this.logger.error(
                        `Error fetching container data for gkey ${carrierVisitGkey}: ${error.message}`,
                        error.stack,
                    );
                    subscriber.next({
                        manifest: { id: 'N.E.', gkey: carrierVisitGkey, vessel_name: 'Error' },
                        summary: {
                            total_units: 0,
                            discharge: { to_discharge: 0, discharging: 0, discharged: 0, total: 0 },
                            load: {
                                not_arrived: 0,
                                not_arrived_in_transit: 0,
                                to_load: 0,
                                loading: 0,
                                loaded: 0,
                                total: 0,
                            },
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

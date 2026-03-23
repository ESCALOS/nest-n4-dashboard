import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContainersMonitoringService } from '../monitoring/containers/containers-monitoring.service';
import { ContainersEventService } from '../monitoring/containers/containers-event.service';

@Injectable()
export class ContainersRefreshJob {
    private readonly logger = new Logger(ContainersRefreshJob.name);
    private isRunning = false;

    constructor(
        private readonly containersService: ContainersMonitoringService,
        private readonly eventService: ContainersEventService,
    ) { }

    /**
     * Refresh container monitoring data for all monitored vessels every 30 seconds
     */
    @Cron(CronExpression.EVERY_30_SECONDS)
    async refreshContainers() {
        if (this.isRunning) {
            this.logger.warn(
                'Previous container refresh job still running, skipping',
            );
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            const vessels = await this.containersService.getMonitoredVessels();

            if (vessels.length === 0) {
                this.logger.debug('No monitored container vessels to refresh');
                return;
            }

            this.logger.debug(
                `Refreshing container data for ${vessels.length} monitored vessels`,
            );

            for (const vessel of vessels) {
                try {
                    await this.containersService.refreshAndCache(vessel.id);
                } catch (error) {
                    this.logger.error(
                        `Failed to refresh container data for manifest ${vessel.id}`,
                        error,
                    );
                }
            }

            // Notify SSE clients that data has been refreshed
            this.eventService.notifyRefresh();

            const duration = Date.now() - startTime;
            this.logger.debug(
                `Container refresh completed in ${duration}ms for ${vessels.length} vessels`,
            );
        } catch (error) {
            this.logger.error('Error in container refresh job', error);
        } finally {
            this.isRunning = false;
        }
    }
}

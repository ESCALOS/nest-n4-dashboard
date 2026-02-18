import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GeneralCargoService } from '../monitoring/general-cargo/general-cargo.service';
import { GeneralCargoEventService } from '../monitoring/general-cargo/general-cargo-event.service';

@Injectable()
export class TransactionRefreshJob {
  private readonly logger = new Logger(TransactionRefreshJob.name);
  private isRunning = false;

  constructor(
    private readonly generalCargoService: GeneralCargoService,
    private readonly eventService: GeneralCargoEventService,
  ) { }

  /**
   * Refresh transactions for all active manifests every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshTransactions() {
    if (this.isRunning) {
      this.logger.warn(
        'Previous transaction refresh job still running, skipping',
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const monitoredOps =
        await this.generalCargoService.getMonitoredOperations();

      if (monitoredOps.length === 0) {
        this.logger.debug('No monitored operations to refresh');
        return;
      }

      this.logger.debug(
        `Refreshing transactions for ${monitoredOps.length} monitored operations`,
      );

      for (const op of monitoredOps) {
        try {
          await this.generalCargoService.fetchAndCacheTransactions(
            op.manifest.id,
            op.operation_type,
          );
          await this.generalCargoService.fetchAndCacheHoldAlerts(
            op.manifest.id,
            op.operation_type,
          );
        } catch (error) {
          this.logger.error(
            `Failed to refresh ${op.operation_type} transactions for manifest ${op.manifest.id}`,
            error,
          );
        }
      }

      // Notify SSE clients that data has been refreshed
      this.eventService.notifyRefresh();

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Transaction refresh completed in ${duration}ms for ${monitoredOps.length} operations`,
      );
    } catch (error) {
      this.logger.error('Error in transaction refresh job', error);
    } finally {
      this.isRunning = false;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class AppointmentsRefreshJob {
  private readonly logger = new Logger(AppointmentsRefreshJob.name);
  private isRunning = false;

  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Refresh appointments in progress every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshAppointments() {
    if (this.isRunning) {
      this.logger.warn(
        'Previous appointments refresh job still running, skipping',
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      await this.appointmentsService.fetchAndCacheAppointments();

      const duration = Date.now() - startTime;
      this.logger.debug(`Appointments refresh completed in ${duration}ms`);
    } catch (error) {
      this.logger.error('Error in appointments refresh job', error);
    } finally {
      this.isRunning = false;
    }
  }
}

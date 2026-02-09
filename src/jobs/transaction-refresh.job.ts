import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShippingService } from '../shipping/shipping.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';
import { OperationType } from '../shipping/enums/operation-type.enum';

@Injectable()
export class TransactionRefreshJob {
  private readonly logger = new Logger(TransactionRefreshJob.name);
  private isRunning = false;

  constructor(
    private readonly shippingService: ShippingService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Refresh transactions for all active manifests every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshTransactions() {
    if (this.isRunning) {
      this.logger.warn('Previous transaction refresh job still running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Get all active manifests
      const activeManifests = await this.redisService.smembers(
        CACHE_KEYS.activeManifests,
      );

      if (activeManifests.length === 0) {
        this.logger.debug('No active manifests to refresh');
        return;
      }

      this.logger.debug(
        `Refreshing transactions for ${activeManifests.length} active manifests`,
      );

      // Process each manifest
      for (const manifestId of activeManifests) {
        await this.refreshManifestTransactions(manifestId);
      }

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Transaction refresh completed in ${duration}ms for ${activeManifests.length} manifests`,
      );
    } catch (error) {
      this.logger.error('Error in transaction refresh job', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async refreshManifestTransactions(manifestId: string): Promise<void> {
    // Refresh transactions for each operation type
    const operationTypes = Object.values(OperationType);

    for (const operationType of operationTypes) {
      try {
        await this.shippingService.fetchAndCacheTransactions(
          manifestId,
          operationType,
        );
      } catch (error) {
        this.logger.error(
          `Failed to refresh ${operationType} transactions for manifest ${manifestId}`,
          error,
        );
        // Continue with other operation types even if one fails
      }
    }
  }
}

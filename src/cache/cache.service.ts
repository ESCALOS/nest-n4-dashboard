import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';
import { OperationType } from '../monitoring/general-cargo/enums/operation-type.enum';

@Injectable()
export class CacheManagementService {
  private readonly logger = new Logger(CacheManagementService.name);

  constructor(private readonly redisService: RedisService) { }

  /**
   * Get the cache key for transactions by manifest and operation type
   */
  private getTransactionKey(manifestId: string, operationType: string): string {
    return CACHE_KEYS.transactions(manifestId, operationType);
  }

  /**
   * Add a manifest to active tracking for a specific operation type
   */
  async addManifestToTracking(
    manifestId: string,
    operationType: OperationType,
  ): Promise<void> {
    const trackingKey = CACHE_KEYS.monitoredOperations;
    const fullKey = `${trackingKey}:${operationType}`;
    await this.redisService.sadd(fullKey, manifestId);
    this.logger.log(`Added manifest ${manifestId} to tracking for ${operationType}`);
  }

  /**
   * Remove a manifest from active tracking for a specific operation type
   */
  async removeManifestFromTracking(
    manifestId: string,
    operationType: OperationType,
  ): Promise<void> {
    const trackingKey = CACHE_KEYS.monitoredOperations;
    const fullKey = `${trackingKey}:${operationType}`;
    await this.redisService.srem(fullKey, manifestId);
    this.logger.log(`Removed manifest ${manifestId} from tracking for ${operationType}`);
  }

  /**
   * Get list of active manifests for a specific operation type
   */
  async getActiveManifestsByOperation(
    operationType: OperationType,
  ): Promise<string[]> {
    const trackingKey = CACHE_KEYS.monitoredOperations;
    const fullKey = `${trackingKey}:${operationType}`;
    return this.redisService.smembers(fullKey);
  }

  /**
   * Get transactions cache key for a manifest and operation type
   */
  getTransactionCacheKey(manifestId: string, operationType: string): string {
    return this.getTransactionKey(manifestId, operationType);
  }

  /**
   * Reset transactions cache for a specific manifest and operation type
   */
  async resetTransactions(
    manifestId: string,
    operationType: OperationType,
  ): Promise<void> {
    const cacheKey = this.getTransactionKey(manifestId, operationType);
    await this.redisService.del(cacheKey);
    this.logger.log(`Reset transactions cache for ${manifestId}:${operationType}`);
  }

  /**
   * Reset bodegas cache for a specific vessel visit
   */
  async resetBodegas(vvdGkey: number): Promise<void> {
    const cacheKey = CACHE_KEYS.holds(vvdGkey);
    await this.redisService.del(cacheKey);
    this.logger.log(`Reset bodegas cache for vvdGkey ${vvdGkey}`);
  }

  /**
   * Reset BL items cache for a specific carrier visit
   */
  async resetBLItems(cvGkey: number): Promise<void> {
    // Reset both SSP and OS patterns
    const asKey = CACHE_KEYS.blItems(cvGkey, true);
    const nasKey = CACHE_KEYS.blItems(cvGkey, false);

    await Promise.all([
      this.redisService.del(asKey),
      this.redisService.del(nasKey),
    ]);

    this.logger.log(`Reset BL items cache for cvGkey ${cvGkey}`);
  }

  /**
   * Reset manifest cache
   */
  async resetManifest(manifestId: string): Promise<void> {
    const cacheKey = CACHE_KEYS.manifest(manifestId);
    await this.redisService.del(cacheKey);
    this.logger.log(`Reset manifest cache for ${manifestId}`);
  }

  /**
   * Reset all caches for a manifest
   * This includes manifest, bodegas, BL items, and transactions
   */
  async resetAllForManifest(manifestId: string): Promise<{
    manifestReset: boolean;
    transactionsReset: number;
  }> {
    // Get manifest info first to get the gkeys
    const manifestKey = CACHE_KEYS.manifest(manifestId);
    const manifest = await this.redisService.getJson<{
      cvGkey: number;
      vvdGkey: number;
    }>(manifestKey);

    // Reset manifest
    await this.redisService.del(manifestKey);

    // Reset transactions for all operation types
    const transactionPattern = `monitoring:general-cargo:transactions:${manifestId}:*`;
    const transactionsDeleted =
      await this.redisService.deleteByPattern(transactionPattern);

    // If we have manifest info, reset bodegas and BL items too
    if (manifest) {
      await this.resetBodegas(manifest.vvdGkey);
      await this.resetBLItems(manifest.cvGkey);
    }

    this.logger.log(
      `Reset all caches for manifest ${manifestId}: ${transactionsDeleted} transaction keys deleted`,
    );

    return {
      manifestReset: true,
      transactionsReset: transactionsDeleted,
    };
  }

  /**
   * Get list of active manifests being tracked (all operation types)
   */
  async getActiveManifests(): Promise<string[]> {
    return this.redisService.smembers(CACHE_KEYS.monitoredOperations);
  }

  /**
   * Remove a manifest from active tracking (all operation types)
   */
  async removeFromActiveManifests(manifestId: string): Promise<void> {
    await this.redisService.srem(CACHE_KEYS.monitoredOperations, manifestId);
    this.logger.log(`Removed ${manifestId} from monitored operations tracking`);
  }

  /**
   * Get all active manifests grouped by operation type
   */
  async getAllActiveManifestsGrouped(): Promise<Record<OperationType, string[]>> {
    const result: Record<OperationType, string[]> = {
      [OperationType.STOCKPILING]: [],
      [OperationType.INDIRECT_LOADING]: [],
      [OperationType.DISPATCHING]: [],
      [OperationType.DIRECT_LOADING]: [],
    };

    for (const opType of Object.values(OperationType)) {
      result[opType] = await this.getActiveManifestsByOperation(opType);
    }

    return result;
  }
}

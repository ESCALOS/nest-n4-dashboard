import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';

@Injectable()
export class CacheManagementService {
  private readonly logger = new Logger(CacheManagementService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Reset bodegas cache for a specific vessel visit
   */
  async resetBodegas(vvdGkey: number): Promise<void> {
    const cacheKey = CACHE_KEYS.bodegas(vvdGkey);
    await this.redisService.del(cacheKey);
    this.logger.log(`Reset bodegas cache for vvdGkey ${vvdGkey}`);
  }

  /**
   * Reset BL items cache for a specific carrier visit
   */
  async resetBLItems(cvGkey: number): Promise<void> {
    // Reset both SSP and OS patterns
    const sspKey = CACHE_KEYS.blItems(cvGkey, 'SSP');
    const osKey = CACHE_KEYS.blItems(cvGkey, 'OS');

    await Promise.all([
      this.redisService.del(sspKey),
      this.redisService.del(osKey),
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
    const transactionPattern = `shipping:transactions:${manifestId}:*`;
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
   * Get list of active manifests being tracked
   */
  async getActiveManifests(): Promise<string[]> {
    return this.redisService.smembers(CACHE_KEYS.activeManifests);
  }

  /**
   * Remove a manifest from active tracking
   */
  async removeFromActiveManifests(manifestId: string): Promise<void> {
    await this.redisService.srem(CACHE_KEYS.activeManifests, manifestId);
    this.logger.log(`Removed ${manifestId} from active manifests`);
  }
}

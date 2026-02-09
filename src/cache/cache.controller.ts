import {
  Controller,
  Post,
  Param,
  Get,
  ParseIntPipe,
  UsePipes,
} from '@nestjs/common';
import { CacheManagementService } from './cache.service';
import { OperationType } from '../shipping/enums/operation-type.enum';
import { ParseOperationTypePipe } from './operation-type.pipe';

@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheManagementService) { }

  /**
   * Reset bodegas cache for a specific vessel visit
   */
  @Post('bodegas/:vvdGkey/reset')
  async resetBodegas(
    @Param('vvdGkey', ParseIntPipe) vvdGkey: number,
  ): Promise<{ message: string }> {
    await this.cacheService.resetBodegas(vvdGkey);
    return { message: `Bodegas cache reset for vvdGkey ${vvdGkey}` };
  }

  /**
   * Reset BL items cache for a specific carrier visit
   */
  @Post('bl-items/:cvGkey/reset')
  async resetBLItems(
    @Param('cvGkey', ParseIntPipe) cvGkey: number,
  ): Promise<{ message: string }> {
    await this.cacheService.resetBLItems(cvGkey);
    return { message: `BL items cache reset for cvGkey ${cvGkey}` };
  }

  /**
   * Reset manifest cache
   */
  @Post('manifest/:manifestId/reset')
  async resetManifest(
    @Param('manifestId') manifestId: string,
  ): Promise<{ message: string }> {
    await this.cacheService.resetManifest(manifestId);
    return { message: `Manifest cache reset for ${manifestId}` };
  }

  /**
   * Reset transactions cache for a specific manifest and operation type
   */
  @Post('transactions/:manifestId/:operationType/reset')
  async resetTransactions(
    @Param('manifestId') manifestId: string,
    @Param('operationType', ParseOperationTypePipe) operationType: OperationType,
  ): Promise<{ message: string }> {
    await this.cacheService.resetTransactions(manifestId, operationType);
    return {
      message: `Transactions cache reset for ${manifestId}:${operationType}`,
    };
  }

  /**
   * Reset all caches for a manifest
   */
  @Post('reset-all/:manifestId')
  async resetAllForManifest(
    @Param('manifestId') manifestId: string,
  ): Promise<{ message: string; details: object }> {
    const result = await this.cacheService.resetAllForManifest(manifestId);
    return {
      message: `All caches reset for manifest ${manifestId}`,
      details: result,
    };
  }

  // ============================================
  // MANIFEST TRACKING BY OPERATION TYPE
  // ============================================

  /**
   * Add a manifest to active tracking for a specific operation type
   */
  @Post('track/:manifestId/:operationType')
  async trackManifest(
    @Param('manifestId') manifestId: string,
    @Param('operationType', ParseOperationTypePipe) operationType: OperationType,
  ): Promise<{ message: string }> {
    await this.cacheService.addManifestToTracking(manifestId, operationType);
    return {
      message: `Manifest ${manifestId} added to tracking for ${operationType}`,
    };
  }

  /**
   * Remove a manifest from active tracking for a specific operation type
   */
  @Post('untrack/:manifestId/:operationType')
  async untrackManifest(
    @Param('manifestId') manifestId: string,
    @Param('operationType', ParseOperationTypePipe) operationType: OperationType,
  ): Promise<{ message: string }> {
    await this.cacheService.removeManifestFromTracking(
      manifestId,
      operationType,
    );
    return {
      message: `Manifest ${manifestId} removed from tracking for ${operationType}`,
    };
  }

  /**
   * Get list of active manifests for a specific operation type
   */
  @Get('active-manifests/:operationType')
  async getActiveManifestsByOperation(
    @Param('operationType', ParseOperationTypePipe) operationType: OperationType,
  ): Promise<{ manifests: string[] }> {
    const manifests = await this.cacheService.getActiveManifestsByOperation(
      operationType,
    );
    return { manifests };
  }

  /**
   * Get all active manifests grouped by operation type
   */
  @Get('active-manifests')
  async getAllActiveManifestsGrouped(): Promise<{
    manifests: Record<OperationType, string[]>;
  }> {
    const manifests = await this.cacheService.getAllActiveManifestsGrouped();
    return { manifests };
  }

  /**
   * Get transactions cache key for a manifest and operation type
   */
  @Get('transactions/:manifestId/:operationType/key')
  async getTransactionKey(
    @Param('manifestId') manifestId: string,
    @Param('operationType', ParseOperationTypePipe) operationType: OperationType,
  ): Promise<{ cacheKey: string }> {
    const cacheKey = this.cacheService.getTransactionCacheKey(
      manifestId,
      operationType,
    );
    return { cacheKey };
  }

  /**
   * Remove a manifest from active tracking (all operation types) - deprecated
   */
  @Post('active-manifests/:manifestId/remove')
  async removeFromActiveManifests(
    @Param('manifestId') manifestId: string,
  ): Promise<{ message: string }> {
    await this.cacheService.removeFromActiveManifests(manifestId);
    return { message: `Removed ${manifestId} from active manifests` };
  }
}

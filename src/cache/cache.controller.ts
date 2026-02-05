import { Controller, Post, Param, Get, ParseIntPipe } from '@nestjs/common';
import { CacheManagementService } from './cache.service';

@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheManagementService) {}

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

  /**
   * Get list of active manifests being tracked
   */
  @Get('active-manifests')
  async getActiveManifests(): Promise<{ manifests: string[] }> {
    const manifests = await this.cacheService.getActiveManifests();
    return { manifests };
  }

  /**
   * Remove a manifest from active tracking
   */
  @Post('active-manifests/:manifestId/remove')
  async removeFromActiveManifests(
    @Param('manifestId') manifestId: string,
  ): Promise<{ message: string }> {
    await this.cacheService.removeFromActiveManifests(manifestId);
    return { message: `Removed ${manifestId} from active manifests` };
  }
}

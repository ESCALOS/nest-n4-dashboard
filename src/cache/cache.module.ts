import { Module } from '@nestjs/common';
import { CacheController } from './cache.controller';
import { CacheManagementService } from './cache.service';

@Module({
  controllers: [CacheController],
  providers: [CacheManagementService],
  exports: [CacheManagementService],
})
export class CacheManagementModule {}

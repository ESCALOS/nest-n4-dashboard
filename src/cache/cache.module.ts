import { Module } from '@nestjs/common';
import { CacheController } from './cache.controller';
import { CacheManagementService } from './cache.service';
import { ParseOperationTypePipe } from './operation-type.pipe';

@Module({
  controllers: [CacheController],
  providers: [CacheManagementService, ParseOperationTypePipe],
  exports: [CacheManagementService],
})
export class CacheManagementModule { }

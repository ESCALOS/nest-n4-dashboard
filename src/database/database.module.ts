import { Module } from '@nestjs/common';
import { N4Module } from './n4/n4.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [N4Module, RedisModule],
  exports: [N4Module, RedisModule],
})
export class DatabaseModule {}

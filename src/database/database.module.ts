import { Module } from '@nestjs/common';
import { N4Module } from './n4/n4.module';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [N4Module, RedisModule, PrismaModule],
  exports: [N4Module, RedisModule, PrismaModule],
})
export class DatabaseModule { }

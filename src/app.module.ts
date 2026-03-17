import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CacheManagementModule } from './cache/cache.module';
import { JobsModule } from './jobs/jobs.module';
import { GeneralCargoModule } from './monitoring/general-cargo/general-cargo.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database connections (N4 SQL Server + Redis + PostgreSQL)
    DatabaseModule,

    // Authentication & Authorization
    AuthModule,
    UsersModule,

    // Business modules
    AppointmentsModule,
    GeneralCargoModule,

    // Cache management
    CacheManagementModule,

    // Background jobs
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global JWT authentication guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global roles authorization guard
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }

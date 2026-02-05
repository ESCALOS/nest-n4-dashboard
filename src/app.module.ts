import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ShippingModule } from './shipping/shipping.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CacheManagementModule } from './cache/cache.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database connections (N4 SQL Server + Redis)
    DatabaseModule,

    // Business modules
    ShippingModule,
    AppointmentsModule,

    // Cache management
    CacheManagementModule,

    // Background jobs
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

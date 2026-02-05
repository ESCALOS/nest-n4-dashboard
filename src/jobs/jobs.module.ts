import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TransactionRefreshJob } from './transaction-refresh.job';
import { AppointmentsRefreshJob } from './appointments-refresh.job';
import { ShippingModule } from '../shipping/shipping.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [ScheduleModule.forRoot(), ShippingModule, AppointmentsModule],
  providers: [TransactionRefreshJob, AppointmentsRefreshJob],
})
export class JobsModule {}

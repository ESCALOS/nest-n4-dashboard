import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TransactionRefreshJob } from './transaction-refresh.job';
import { AppointmentsRefreshJob } from './appointments-refresh.job';
import { GeneralCargoModule } from '../monitoring/general-cargo/general-cargo.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [ScheduleModule.forRoot(), GeneralCargoModule, AppointmentsModule],
  providers: [TransactionRefreshJob, AppointmentsRefreshJob],
})
export class JobsModule { }

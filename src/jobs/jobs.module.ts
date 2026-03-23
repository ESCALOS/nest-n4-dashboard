import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TransactionRefreshJob } from './transaction-refresh.job';
import { AppointmentsRefreshJob } from './appointments-refresh.job';
import { ContainersRefreshJob } from './containers-refresh.job';
import { GeneralCargoModule } from '../monitoring/general-cargo/general-cargo.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ContainersMonitoringModule } from '../monitoring/containers/containers-monitoring.module';

@Module({
  imports: [ScheduleModule.forRoot(), GeneralCargoModule, AppointmentsModule, ContainersMonitoringModule],
  providers: [TransactionRefreshJob, AppointmentsRefreshJob, ContainersRefreshJob],
})
export class JobsModule { }

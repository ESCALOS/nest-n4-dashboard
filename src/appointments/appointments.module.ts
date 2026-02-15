import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsEventService } from './appointments-event.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsEventService],
  exports: [AppointmentsService, AppointmentsEventService],
})
export class AppointmentsModule { }

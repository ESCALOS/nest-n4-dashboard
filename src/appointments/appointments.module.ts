import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsEventService } from './appointments-event.service';
import { SseOneTimeTokenGuard } from '../auth/guards/sse-one-time-token.guard';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsEventService, SseOneTimeTokenGuard],
  exports: [AppointmentsService, AppointmentsEventService],
})
export class AppointmentsModule { }

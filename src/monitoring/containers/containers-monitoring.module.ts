import { Module } from '@nestjs/common';
import { ContainersMonitoringService } from './containers-monitoring.service';
import { ContainersMonitoringController } from './containers-monitoring.controller';
import { ContainersEventService } from './containers-event.service';
import { SseOneTimeTokenGuard } from '../../auth/guards/sse-one-time-token.guard';

@Module({
    controllers: [ContainersMonitoringController],
    providers: [ContainersMonitoringService, ContainersEventService, SseOneTimeTokenGuard],
    exports: [ContainersMonitoringService, ContainersEventService],
})
export class ContainersMonitoringModule { }

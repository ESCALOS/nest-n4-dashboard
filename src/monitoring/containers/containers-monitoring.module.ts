import { Module } from '@nestjs/common';
import { ContainersMonitoringService } from './containers-monitoring.service';
import { ContainersMonitoringController } from './containers-monitoring.controller';
import { ContainersEventService } from './containers-event.service';

@Module({
    controllers: [ContainersMonitoringController],
    providers: [ContainersMonitoringService, ContainersEventService],
    exports: [ContainersMonitoringService, ContainersEventService],
})
export class ContainersMonitoringModule { }

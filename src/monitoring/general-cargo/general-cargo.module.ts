import { Module } from '@nestjs/common';
import { GeneralCargoService } from './general-cargo.service';
import { GeneralCargoController } from './general-cargo.controller';
import { GeneralCargoEventService } from './general-cargo-event.service';
import { SseOneTimeTokenGuard } from '../../auth/guards/sse-one-time-token.guard';

@Module({
  controllers: [GeneralCargoController],
  providers: [GeneralCargoService, GeneralCargoEventService, SseOneTimeTokenGuard],
  exports: [GeneralCargoService, GeneralCargoEventService],
})
export class GeneralCargoModule { }

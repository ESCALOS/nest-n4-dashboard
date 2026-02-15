import { Module } from '@nestjs/common';
import { GeneralCargoService } from './general-cargo.service';
import { GeneralCargoController } from './general-cargo.controller';
import { GeneralCargoEventService } from './general-cargo-event.service';

@Module({
  controllers: [GeneralCargoController],
  providers: [GeneralCargoService, GeneralCargoEventService],
  exports: [GeneralCargoService, GeneralCargoEventService],
})
export class GeneralCargoModule { }

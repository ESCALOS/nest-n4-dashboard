import { Module } from '@nestjs/common';
import { GeneralCargoService } from './general-cargo.service';
import { GeneralCargoController } from './general-cargo.controller';

@Module({
  controllers: [GeneralCargoController],
  providers: [GeneralCargoService, GeneralCargoController],
  exports: [GeneralCargoService, GeneralCargoController],
})
export class GeneralCargoModule { }

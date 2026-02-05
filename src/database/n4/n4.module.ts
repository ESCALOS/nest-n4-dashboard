import { Module, Global } from '@nestjs/common';
import { N4Service } from './n4.service';

@Global()
@Module({
  providers: [N4Service],
  exports: [N4Service],
})
export class N4Module {}

import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
    @Public()
    @Get()
    health() {
        return {
            ok: true,
            timestamp: new Date().toISOString(),
        };
    }
}

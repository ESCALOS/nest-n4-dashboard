import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from '../../database/redis/redis.service';
import { CACHE_KEYS } from '../../common/constants/cache-keys.constant';

const SSE_TOKEN_COOKIE_NAME = 'n4_sse_ott';

@Injectable()
export class SseOneTimeTokenGuard implements CanActivate {
    constructor(private readonly redisService: RedisService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
        const token = request.cookies?.[SSE_TOKEN_COOKIE_NAME];

        if (!token) {
            throw new UnauthorizedException('Missing SSE token cookie');
        }

        const key = CACHE_KEYS.sseOneTimeToken(token);
        const value = await this.redisService.getClient().call('GETDEL', key);
        const isValid = typeof value === 'string' && value.length > 0;

        if (!isValid) {
            throw new UnauthorizedException('Invalid or expired SSE token');
        }

        return true;
    }
}

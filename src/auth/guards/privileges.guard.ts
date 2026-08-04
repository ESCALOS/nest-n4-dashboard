import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Privilege, Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { CACHE_KEYS } from '../../common/constants/cache-keys.constant';
import { PRIVILEGES_KEY } from '../decorators/privileges.decorator';
import type { ActiveUser } from '../interfaces/jwt-payload.interface';

const SSE_TOKEN_COOKIE_NAME = 'n4_sse_ott';

type AuthenticatedRequest = Request & {
    user?: ActiveUser;
    cookies?: Record<string, string>;
};

@Injectable()
export class PrivilegesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPrivileges = this.reflector.getAllAndOverride<Privilege[]>(
            PRIVILEGES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredPrivileges?.length) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const userId = request.user?.userId ?? await this.getSseUserId(request);

        if (!userId) {
            throw new UnauthorizedException('Authenticated user not found');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, privileges: true, isActive: true },
        });

        if (!user?.isActive) {
            throw new UnauthorizedException('User account is inactive');
        }

        if (user.role === Role.ADMIN) {
            return true;
        }

        const hasPrivilege = requiredPrivileges.some((privilege) =>
            user.privileges.includes(privilege),
        );

        if (!hasPrivilege) {
            throw new ForbiddenException('Insufficient privileges');
        }

        return true;
    }

    private async getSseUserId(request: AuthenticatedRequest): Promise<string | null> {
        const token = request.cookies?.[SSE_TOKEN_COOKIE_NAME];
        if (!token) return null;

        const value = await this.redisService.get(CACHE_KEYS.sseOneTimeToken(token));
        if (!value) return null;

        try {
            const parsed = JSON.parse(value) as { userId?: unknown };
            return typeof parsed.userId === 'string' ? parsed.userId : null;
        } catch {
            return null;
        }
    }
}

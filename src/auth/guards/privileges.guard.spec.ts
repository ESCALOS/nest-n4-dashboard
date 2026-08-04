import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Privilege, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../database/redis/redis.service';
import { PrivilegesGuard } from './privileges.guard';

describe('PrivilegesGuard', () => {
    const required = [Privilege.VIEW_GENERAL_CARGO_MONITORING];
    const reflector = { getAllAndOverride: jest.fn() };
    const findUnique = jest.fn();
    const redisGet = jest.fn();
    const prisma = { user: { findUnique } };
    const redis = { get: redisGet };
    let guard: PrivilegesGuard;

    const context = (request: Record<string, unknown>) => ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        reflector.getAllAndOverride.mockReturnValue(required);
        guard = new PrivilegesGuard(
            reflector as unknown as Reflector,
            prisma as unknown as PrismaService,
            redis as unknown as RedisService,
        );
    });

    it('allows an administrator without assigned privileges', async () => {
        findUnique.mockResolvedValue({ role: Role.ADMIN, privileges: [], isActive: true });

        await expect(guard.canActivate(context({ user: { userId: 'admin-id' } })))
            .resolves.toBe(true);
    });

    it('allows a user with the required privilege', async () => {
        findUnique.mockResolvedValue({ role: Role.USER, privileges: required, isActive: true });

        await expect(guard.canActivate(context({ user: { userId: 'user-id' } })))
            .resolves.toBe(true);
    });

    it('rejects a user without the required privilege', async () => {
        findUnique.mockResolvedValue({ role: Role.USER, privileges: [], isActive: true });

        await expect(guard.canActivate(context({ user: { userId: 'user-id' } })))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('resolves the user identity from an SSE one-time token', async () => {
        redisGet.mockResolvedValue(JSON.stringify({ userId: 'sse-user-id' }));
        findUnique.mockResolvedValue({ role: Role.USER, privileges: required, isActive: true });

        await expect(guard.canActivate(context({ cookies: { n4_sse_ott: 'token' } })))
            .resolves.toBe(true);
        expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'sse-user-id' },
        }));
    });
});

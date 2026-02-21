import {
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { RedisService } from '../database/redis/redis.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto } from './dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) { }

    async login(loginDto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: loginDto.email },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Credenciales inválidas.');
        }

        const isPasswordValid = await argon2.verify(
            user.passwordHash,
            loginDto.password,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales inválidas.');
        }

        const tokens = await this.generateTokens(user.id, user.email, user.role);

        this.logger.log(`User ${user.email} logged in`);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        };
    }

    async refreshToken(refreshToken: string) {
        const tokenHash = this.hashToken(refreshToken);

        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
            if (storedToken && !storedToken.revoked) {
                // Token expired — clean up
                await this.prisma.refreshToken.update({
                    where: { id: storedToken.id },
                    data: { revoked: true },
                });
            }
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        if (!storedToken.user.isActive) {
            throw new UnauthorizedException('User account is deactivated');
        }

        // Revoke old refresh token (rotation)
        await this.prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked: true },
        });

        // Generate new token pair
        const tokens = await this.generateTokens(
            storedToken.user.id,
            storedToken.user.email,
            storedToken.user.role,
        );

        this.logger.log(`Token refreshed for user ${storedToken.user.email}`);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        };
    }

    async logout(accessToken: string, userId: string) {
        // Blacklist the access token in Redis until it expires
        const decoded = this.jwtService.decode(accessToken) as { exp: number };
        if (decoded?.exp) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await this.redisService.set(`bl:${accessToken}`, '1', ttl);
            }
        }

        // Revoke all refresh tokens for this user
        await this.prisma.refreshToken.updateMany({
            where: { userId, revoked: false },
            data: { revoked: true },
        });

        this.logger.log(`User ${userId} logged out`);
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const isValid = await argon2.verify(user.passwordHash, currentPassword);
        if (!isValid) {
            throw new UnauthorizedException('La contraseña actual es incorrecta');
        }

        const newHash = await argon2.hash(newPassword);
        await this.prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        this.logger.log(`User ${user.email} changed their password`);
    }

    private async generateTokens(userId: string, email: string, role: string) {
        const payload: JwtPayload = {
            sub: userId,
            email,
            role: role as any,
        };

        const accessToken = this.jwtService.sign(payload);

        // Generate a cryptographically secure refresh token
        const refreshToken = randomBytes(64).toString('hex');
        const tokenHash = this.hashToken(refreshToken);

        const refreshExpirationSeconds = this.configService.get<number>(
            'jwt.refreshExpiration',
            604800, // 7 days default
        );

        await this.prisma.refreshToken.create({
            data: {
                tokenHash,
                userId,
                expiresAt: new Date(Date.now() + refreshExpirationSeconds * 1000),
            },
        });

        return { accessToken, refreshToken };
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}

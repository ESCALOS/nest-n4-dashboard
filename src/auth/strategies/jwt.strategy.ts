import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { Request } from 'express';
import { RedisService } from '../../database/redis/redis.service';
import { JwtPayload, ActiveUser } from '../interfaces/jwt-payload.interface';
import { CACHE_KEYS } from '../../common/constants/cache-keys.constant';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly redisService: RedisService,
    ) {
        const opts: StrategyOptionsWithRequest = {
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                ExtractJwt.fromUrlQueryParameter('token'),
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('jwt.secret')!,
            passReqToCallback: true,
        };
        super(opts);
    }

    async validate(req: Request, payload: JwtPayload): Promise<ActiveUser> {
        const token =
            ExtractJwt.fromAuthHeaderAsBearerToken()(req as any) ||
            ExtractJwt.fromUrlQueryParameter('token')(req as any);

        if (!token) {
            throw new UnauthorizedException('Token not found');
        }

        // Check if token is blacklisted in Redis
        const isBlacklisted = await this.redisService.exists(
            CACHE_KEYS.tokenBlacklist(token),
        );

        if (isBlacklisted) {
            throw new UnauthorizedException('Token has been revoked');
        }

        return {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
        };
    }
}

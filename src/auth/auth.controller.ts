import {
    Controller,
    Post,
    Patch,
    Body,
    HttpCode,
    HttpStatus,
    Req,
    Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/active-user.decorator';
import type { ActiveUser } from './interfaces/jwt-payload.interface';
import type { Request, Response } from 'express';

const SSE_TOKEN_COOKIE_NAME = 'n4_sse_ott';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto.refreshToken);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(
        @Req() req: Request,
        @GetUser() user: ActiveUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
        await this.authService.logout(token, user.userId);
        res.clearCookie(SSE_TOKEN_COOKIE_NAME, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
        });
        return { message: 'Logged out successfully' };
    }

    @Post('sse-token')
    @HttpCode(HttpStatus.OK)
    async issueSseTokenCookie(
        @GetUser() user: ActiveUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { token, ttlSeconds } = await this.authService.createSseOneTimeToken(user.userId);

        res.cookie(SSE_TOKEN_COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: ttlSeconds * 1000,
        });

        return {
            success: true,
            expiresInSeconds: ttlSeconds,
        };
    }

    @Post('me')
    @HttpCode(HttpStatus.OK)
    async me(@GetUser() user: ActiveUser) {
        return user;
    }

    @Patch('me/password')
    @HttpCode(HttpStatus.OK)
    async changePassword(
        @GetUser() user: ActiveUser,
        @Body() dto: ChangePasswordDto,
    ) {
        await this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
        return { message: 'Contraseña actualizada correctamente' };
    }
}

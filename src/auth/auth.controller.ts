import {
    Controller,
    Post,
    Patch,
    Body,
    HttpCode,
    HttpStatus,
    Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/active-user.decorator';
import type { ActiveUser } from './interfaces/jwt-payload.interface';

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
    async logout(@Req() req: any, @GetUser() user: ActiveUser) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        await this.authService.logout(token, user.userId);
        return { message: 'Logged out successfully' };
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

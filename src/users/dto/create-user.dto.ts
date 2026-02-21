import {
    IsEmail,
    IsString,
    MinLength,
    IsOptional,
    IsEnum,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsEnum(Role)
    @IsOptional()
    role?: Role;
}

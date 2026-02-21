import {
    IsString,
    IsOptional,
    IsEnum,
    IsBoolean,
    MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @MinLength(6)
    @IsOptional()
    password?: string;

    @IsEnum(Role)
    @IsOptional()
    role?: Role;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

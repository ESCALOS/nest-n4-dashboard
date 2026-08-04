import {
    IsString,
    IsOptional,
    IsEnum,
    IsBoolean,
    MinLength,
    IsArray,
} from 'class-validator';
import { Privilege, Role } from '@prisma/client';

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

    @IsArray()
    @IsEnum(Privilege, { each: true })
    @IsOptional()
    privileges?: Privilege[];
}

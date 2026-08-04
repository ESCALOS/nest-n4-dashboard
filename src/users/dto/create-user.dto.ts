import {
    IsEmail,
    IsString,
    MinLength,
    IsOptional,
    IsEnum,
    IsArray,
} from 'class-validator';
import { Privilege, Role } from '@prisma/client';

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

    @IsArray()
    @IsEnum(Privilege, { each: true })
    @IsOptional()
    privileges?: Privilege[];
}

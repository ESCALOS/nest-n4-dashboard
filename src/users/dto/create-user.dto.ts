import { ShippingLine } from '@prisma/client';
import { IsBoolean as InternalBoolean } from 'class-validator';

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
  @IsOptional() @InternalBoolean() isInternal?: boolean;
  @IsOptional()
  @IsArray()
  @IsEnum(ShippingLine, { each: true })
  allowedLines?: ShippingLine[];
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

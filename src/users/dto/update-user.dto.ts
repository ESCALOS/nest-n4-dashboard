import { ShippingLine } from '@prisma/client';
import { IsBoolean as InternalBoolean } from 'class-validator';

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
  @IsOptional() @InternalBoolean() isInternal?: boolean;
  @IsOptional()
  @IsArray()
  @IsEnum(ShippingLine, { each: true })
  allowedLines?: ShippingLine[];
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

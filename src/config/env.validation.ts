import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  validateSync,
  Min,
  Max,
} from 'class-validator';

class EnvironmentVariables {
  // PostgreSQL
  @IsString()
  DATABASE_URL: string;

  // N4 SQL Server
  @IsString()
  N4_DB_HOST: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  N4_DB_PORT: number = 1433;

  @IsString()
  N4_DB_USER: string;

  @IsString()
  N4_DB_PASSWORD: string;

  @IsString()
  N4_DB_NAME: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  // Job Intervals
  @IsNumber()
  @Min(1000)
  @IsOptional()
  SHIPPING_REFRESH_INTERVAL: number = 15000;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  APPOINTMENTS_REFRESH_INTERVAL: number = 5000;

  // JWT
  @IsString()
  JWT_SECRET: string;

  @IsNumber()
  @Min(60)
  @IsOptional()
  JWT_EXPIRATION: number = 3600;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsNumber()
  @Min(60)
  @IsOptional()
  JWT_REFRESH_EXPIRATION: number = 604800;

  // Admin seed
  @IsString()
  @IsOptional()
  ADMIN_EMAIL: string = 'admin@navis.com';

  @IsString()
  @IsOptional()
  ADMIN_PASSWORD: string = 'admin123456';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}

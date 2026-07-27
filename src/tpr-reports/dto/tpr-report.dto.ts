import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TprReportType } from '../tpr-report.types';

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UNIQUE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class TprSummaryQueryDto {
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must use YYYY-MM format' })
  period: string;

  @IsEnum(TprReportType)
  type: TprReportType = TprReportType.ALL;
}

export class TprDetailQueryDto {
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must use YYYY-MM format' })
  period: string;

  @IsIn([TprReportType.CONTAINER_VESSEL, TprReportType.TRUCK_IN_OUT])
  reportType: TprReportType.CONTAINER_VESSEL | TprReportType.TRUCK_IN_OUT;

  @IsString()
  @MaxLength(30)
  @Matches(UNIQUE_ID_PATTERN, {
    message: 'uniqueId contains invalid characters',
  })
  uniqueId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}

export class TprDetailExportQueryDto {
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must use YYYY-MM format' })
  period: string;

  @IsIn([TprReportType.CONTAINER_VESSEL, TprReportType.TRUCK_IN_OUT])
  reportType: TprReportType.CONTAINER_VESSEL | TprReportType.TRUCK_IN_OUT;

  @IsString()
  @MaxLength(30)
  @Matches(UNIQUE_ID_PATTERN, {
    message: 'uniqueId contains invalid characters',
  })
  uniqueId: string;
}

export class RegenerateTprReportDto {
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must use YYYY-MM format' })
  period: string;
}

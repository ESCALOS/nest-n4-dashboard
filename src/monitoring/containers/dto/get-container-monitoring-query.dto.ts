import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class GetContainerMonitoringQueryDto {
    @IsString()
    @IsNotEmpty()
    manifest_id: string;
}

export class GetContainerByGkeyQueryDto {
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    carrier_visit_gkey: number;
}

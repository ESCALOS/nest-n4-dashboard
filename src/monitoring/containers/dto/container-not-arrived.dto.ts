import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export interface ContainerNotArrivedItemDto {
    container_number: string;
    booking: string;
    operator: string;
    pod: string;
    shipper_name: string;
    technology: string;
    commodity: string;
    order_gkey: number | null;
}

export class RefreshContainerBookingsDto {
    @IsString()
    @IsNotEmpty()
    manifest_id: string;

    @IsOptional()
    @IsArray()
    @Type(() => Number)
    @IsInt({ each: true })
    @Min(1, { each: true })
    order_gkeys?: number[];
}

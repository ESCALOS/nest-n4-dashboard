import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { SspPermissionScope } from '@prisma/client';
import { OperationVesselRequestDto } from './operation-vessel-request.dto';

export class SaveSspPermissionClassificationItemDto {
    @Type(() => Number)
    @IsInt()
    bl_item_gkey: number;

    @IsString()
    permission_nbr: string;

    @IsOptional()
    @IsEnum(SspPermissionScope)
    permission_scope?: SspPermissionScope | null;
}

export class SaveSspPermissionClassificationsDto extends OperationVesselRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SaveSspPermissionClassificationItemDto)
    items: SaveSspPermissionClassificationItemDto[];
}
import { IsEnum, IsString } from 'class-validator';
import { OperationType } from '../enums/operation-type.enum';

export class OperationVesselRequestDto {
    @IsString()
    manifest_id: string;

    @IsEnum(OperationType)
    operation_type: OperationType;
}
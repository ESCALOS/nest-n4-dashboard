import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { OperationType } from '../enums/operation-type.enum';

export class GetOperationsDto {
  @IsString()
  @IsNotEmpty()
  manifestId: string;

  @IsEnum(OperationType)
  @IsNotEmpty()
  operationType: OperationType;
}

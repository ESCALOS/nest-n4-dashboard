import {
    PipeTransform,
    Injectable,
    BadRequestException,
} from '@nestjs/common';
import { OperationType } from '../shipping/enums/operation-type.enum';

@Injectable()
export class ParseOperationTypePipe implements PipeTransform<string, OperationType> {
    transform(value: string): OperationType {
        const validTypes = Object.values(OperationType);

        if (!validTypes.includes(value as OperationType)) {
            throw new BadRequestException(
                `Invalid operation type: ${value}. Valid types: ${validTypes.join(', ')}`,
            );
        }

        return value as OperationType;
    }
}

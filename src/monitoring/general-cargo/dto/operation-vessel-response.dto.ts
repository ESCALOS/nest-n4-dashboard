import { OperationType } from '../enums/operation-type.enum';
import { Manifest } from '../interfaces/manifest.interface';
import { Summary } from '../interfaces/summary.interface';
import { Transaction } from '../interfaces/transaction.interface';

export interface VesselData {
    manifest: Manifest;
    operation_type: OperationType;
    summary: {
        holds: Summary[];
        services: Summary[];
    };
    last_update: string;
    shifts_worked: string[];
    transactions: Transaction[];
}

export interface MonitoringGeneralCargoResponse {
    success: boolean;
    data: VesselData;
}
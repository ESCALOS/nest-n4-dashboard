import { OperationType } from '../enums/operation-type.enum';
import { Manifest } from '../interfaces/manifest.interface';
import { Summary } from '../interfaces/summary.interface';
import { Transaction } from '../interfaces/transaction.interface';
import { CompletionAlertDto } from './completion-alert.dto';
import { HoldAlertDto } from './hold-alert.dto';

export interface VesselData {
    manifest: Manifest;
    operation_type: OperationType;
    supports_ssp_classification: boolean;
    summary: {
        holds: Summary[];
        services: Summary[];
    };
    last_update: string;
    shifts_worked: string[];
    transactions: Transaction[];
    hold_alerts: HoldAlertDto[];
    completion_alerts: CompletionAlertDto[];
}

export interface MonitoringGeneralCargoResponse {
    success: boolean;
    data: VesselData;
}
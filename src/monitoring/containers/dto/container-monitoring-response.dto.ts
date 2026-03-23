export type ContainerOperationStatus =
    | 'TO_DISCHARGE'
    | 'DISCHARGED'
    | 'NOT_ARRIVED'
    | 'TO_LOAD'
    | 'LOADED'
    | 'RESTOW_PENDING'
    | 'RESTOW_ON_YARD'
    | 'RESTOW_COMPLETED';

export interface ContainerMonitoringItemDto {
    unit_gkey: number;
    container_number: string;
    iso_type: string;
    technology: string;
    size: 20 | 40 | null;
    operation_status: ContainerOperationStatus;
    position: string;
    arrival_position: string;
    planned_position: string;
    freight_kind: string;
    bay: number | null;
}

export interface BayPendingCountDto {
    bay: number;
    pending: number;
}

export interface ContainerMonitoringSummaryDto {
    total_units: number;
    discharge: {
        to_discharge: number;
        discharged: number;
        total: number;
    };
    load: {
        not_arrived: number;
        to_load: number;
        loaded: number;
        total: number;
    };
    restow: {
        pending: number;
        on_yard: number;
        completed: number;
        total: number;
    };
}

export interface ContainerMonitoringDataDto {
    manifest: {
        id: string;
        gkey: number;
        vessel_name: string;
    };
    summary: ContainerMonitoringSummaryDto;
    pending_by_bay: {
        discharge: BayPendingCountDto[];
        load: BayPendingCountDto[];
        not_arrived: BayPendingCountDto[];
        restow: BayPendingCountDto[];
    };
    containers: ContainerMonitoringItemDto[];
    last_update: string;
}

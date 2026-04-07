export type ContainerOperationStatus =
    | 'TO_DISCHARGE'
    | 'DISCHARGING'
    | 'DISCHARGED'
    | 'NOT_ARRIVED'
    | 'NOT_ARRIVED_IN_TRANSIT'
    | 'TO_LOAD'
    | 'LOADING'
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
        discharging: number;
        discharged: number;
        total: number;
    };
    load: {
        not_arrived: number;
        not_arrived_in_transit: number;
        to_load: number;
        loading: number;
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

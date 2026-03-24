export interface ContainerOperationReportRowDto {
    start: string;
    end: string;
    total_movements: number;
    current_movements: number;
    pending_movements: number;
}

export interface ContainerOperationsReportDto {
    manifest_id: string;
    vessel_name: string;
    voyage: string;
    loading: ContainerOperationReportRowDto;
    discharge: ContainerOperationReportRowDto;
    restow: ContainerOperationReportRowDto;
    generated_at: string;
}

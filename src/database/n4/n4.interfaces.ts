export interface ManifestResult {
    gkey: number;
    vvd_gkey: number;
    vessel_name: string;
}

export interface ContainerManifestResult {
    gkey: number;
    manifest_id: string;
    vvd_gkey: number;
    vessel_name: string;
    cargo_type: string | null;
    voyage: string | null;
}

export interface WorkingVesselResult {
    manifest_id: string;
    vessel_name: string;
}

export interface VesselByCarrierVisitResult {
    carrier_visit_gkey: number;
    manifest_id: string;
    vessel_name: string;
    line_id: string | null;
    line_name: string | null;
}

export interface OrderInfoResult {
    order_gkey: number;
    booking: string | null;
    commodity: string | null;
}

export interface BlItemInfoResult {
    bl_item_gkey: number;
    permiso: string | null;
    commodity: string | null;
    cliente: string | null;
}

export interface VesselOperationItemResult {
    gkey: number;
    nbr: string;
    manifested_weight: number;
    manifested_goods: number;
    commodity?: string;
}

export interface TransactionResult {
    hold: string;
    bl_item_gkey: number;
    shift: string;
    total_goods: number;
    total_weight: number;
    total_tickets: number;
}

export interface StockpilingTicket {
    codigo: string;
    blItemGkey: number;
    gRemision: string;
    gTransportista: string;
    pesoIngreso: number;
    pesoSalida: number;
    pesoNeto: number;
    tracto: string;
    carreta: string;
    conductor: string;
    fechaSalida: string;
    notas: string;
    rucTransportista: string;
    bodega: string;
}

export interface IndirectShipmentTicket {
    codigo: number;
    unit: string;
    blItemGkey: number;
    pesoIngreso: number;
    pesoSalida: number;
    pesoNeto: number;
    bodega: string;
    tracto: string;
    chassis: string;
    conductor: string;
    fechaSalida: string;
}

export interface AppointmentResult {
    TranGkey: number | string | null;
    Cita?: string;
    codigo?: string;
    Fecha?: Date | null;
    Booking?: string;
    BlItemGkey?: number | string | null;
    OrderGkey?: number | null;
    VesselVisitGkey?: number | null;
    GateGkey?: number | null;
    Cliente?: string;
    Contenedor?: string;
    Tecnologia?: string;
    Producto?: string;
    Nave?: string;
    Placa?: string;
    Carreta?: string;
    Tracto?: string;
    Chassis?: string;
    Stage: string;
    Tranquera?: Date | null;
    PreGate?: Date | null;
    GateIn?: Date | null;
    ZonaEspera?: Date | null;
    InicioCarguio?: Date | null;
    Yard?: Date | null;
    GateOut?: Date | null;
    Tipo?: string;
    TipoOperativa?: string;
    PuertoDescarga?: string;
}

export interface AppointmentStageResult {
    TranGkey: number | string | null;
    Tranquera: Date | null;
    PreGate: Date | null;
    GateIn: Date | null;
    ZonaEspera?: Date | null;
    InicioCarguio?: Date | null;
    Yard: Date | null;
    GateOut?: Date | null;
}

export interface PendingAppointmentResult {
    Cita: string;
    Fecha: Date;
    OrderGkey: number | null;
    Placa: string;
    Carreta: string;
    Cliente: string;
    Tecnologia: string;
    Contenedor: string;
    VesselVisitGkey: number | null;
    Tipo: string;
}

export interface HoldAlertUnitResult {
    unit_id: string;
    hold: string;
}

export interface ContainerMonitoringResult {
    unit_gkey: number;
    container_number: string;
    iso_type: string | null;
    technology: string | null;
    nominal_length: number | null;
    freight_kind: string | null;
    category: string | null;
    transit_state: string | null;
    position: string | null;
    arrival_position: string | null;
    planned_position: string | null;
    actual_ib_cv: number | null;
    actual_ob_cv: number | null;
    restow_typ: string | null;
}

export interface ContainerMonitoringRefreshResult {
    unit_gkey: number;
    container_number: string;
    iso_type: string | null;
    technology: string | null;
    nominal_length: number | null;
    freight_kind: string | null;
    category: string | null;
    transit_state: string | null;
    position: string | null;
    arrival_position: string | null;
    actual_ib_cv: number | null;
    actual_ob_cv: number | null;
    restow_typ: string | null;
}

export interface ContainerOperationTimelineResult {
    operation_type: 'DISCHARGE' | 'LOAD' | 'RESTOW';
    start_time: Date | null;
    end_time: Date | null;
}
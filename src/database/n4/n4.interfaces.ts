export interface ManifestResult {
    gkey: number;
    vvd_gkey: number;
    vessel_name: string;
}

export interface VesselOperationItemResult {
    gkey: number;
    nbr: string;
    manifested_weight: number;
    manifested_goods: number;
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
    blItemNbr: string;
    gRemision: string;
    gTransportista: string;
    pesoIngreso: number;
    pesoSalida: number;
    pesoNeto: number;
    tracto: string;
    carreta: string;
    conductor: string;
    fechaSalida: string;
}

export interface AppointmentResult {
    Cita: string;
    Fecha: Date;
    Booking: string;
    Linea: string;
    Cliente: string;
    Contenedor: string;
    Tecnologia: string;
    Producto: string;
    Nave: string;
    Placa: string;
    Carreta: string;
    Stage: string;
    Tranquera: Date | null;
    PreGate: Date | null;
    GateIn: Date | null;
    Yard: Date | null;
    Tipo: string;
}
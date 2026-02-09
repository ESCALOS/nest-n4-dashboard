export interface ManifestResult {
    gkey: number;
    vvd_gkey: number;
    name: string;
}

export interface BLItemResult {
    gkey: number;
    nbr: string;
    pesoManifestado: number;
    bultosManifestados: number;
}

export interface BodegaResult {
    gkey: number;
    nbr: string;
    pesoManifestado: number;
    bultosManifestados: number;
}

export interface TransactionResult {
    bodega: string;
    blItemGkey: number;
    jornada: string;
    totalBultos: number;
    totalPeso: number;
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
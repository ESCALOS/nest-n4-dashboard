import { IsNotEmpty, IsString } from 'class-validator';

export class GetEirPrintDataDto {
    @IsString()
    @IsNotEmpty()
    appointmentId: string;
}

export class EirDamageDetailDto {
    location: string;
    damageType: string;
    component: string;
    repairMethod: string;
    responsible: string;
    quantity: number | null;
    eirNbr: string;
    length: number | null;
    width: number | null;
    area: number | null;
}

export class BookingInfoDto {
    booking: string;
    manifiesto: string;
    viaje: string;
    mercaderia: string;
    tempRequired: string;
    tecnologia: string;
}

export class EirHeaderDto {
    gkey: string;
    codigo: string;
    lineaNaviera: string | null;
    nave: string | null;
    viaje: string | null;
    gate: string | null;
    inicio: Date | null;
    mercaderia: string | null;
    fin: Date | null;
    tecnico: string;
    contenedor: string;
    iso: string;
    tipo: string;
    tara: number | null;
    pesoMaximo: number | null;
    pesoBruto: number | null;
    estado: string;
    resultado: string;
    tipoCarga: string;
    clasificacion: string;
    condicion: string;
    fabricacion: string;
    precintos: string;
    booking: string;
    placa: string;
    chofer: string;
    humedad: string;
    ventilacion: string;
    tecnologia: string;
    temperaturaBooking: string;
    temperatura: string;
    o2: string;
    co2: string;
    door: string;
    front: string;
    leftSide: string;
    rightSide: string;
    topRoof: string;
    inner: string;
    understructure: string;
    observaciones: string;
}

export class AppointmentEirPrintDataDto {
    appointmentId: string;
    hasEir: boolean;
    bookingInfo: BookingInfoDto;
    eir: EirHeaderDto | null;
    damages: EirDamageDetailDto[];
}

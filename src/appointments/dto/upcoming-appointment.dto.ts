export type AppointmentEstado = 'vencida' | 'activa' | 'pendiente';

export class UpcomingAppointmentDto {
    cita: string;
    fechaCita: Date | null;
    linea: string;
    booking: string;
    placa: string;
    carreta: string;
    cliente: string;
    tecnologia: string;
    producto: string;
    contenedor: string;
    nave: string;
    tipo: string;
    estado: AppointmentEstado;
}

export class UpcomingAppointmentsResponseDto {
    data: UpcomingAppointmentDto[];
    count: number;
    timestamp: Date;
}

export class AppointmentInProgressDto {
  cita: string;
  fecha: Date | null;
  booking: string;
  linea: string;
  cliente: string;
  contenedor: string;
  tecnologia: string;
  producto: string;
  nave: string;
  placa: string;
  carreta: string;
  stage: string;
  tranquera: Date | null;
  preGate: Date | null;
  gateIn: Date | null;
  yard: Date | null;
  tipo: string;
}

export class AppointmentsResponseDto {
  data: AppointmentInProgressDto[];
  count: number;
  timestamp: Date;
}

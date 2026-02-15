export class AppointmentInProgressDto {
  cita: string;
  fechaCita: Date | null;
  fechaStage: Date | null;
  stage: string;
  tiempo: number | null;
  linea: string;
  booking: string;
  placa: string;
  cliente: string;
  tecnologia: string;
  producto: string;
  contenedor: string;
  nave: string;
  carreta: string;
  tipo: string;
}

export class AppointmentsResponseDto {
  data: AppointmentInProgressDto[];
  count: number;
  timestamp: Date;
}

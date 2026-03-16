/**
 * Appointment in progress data transfer object.
 * 
 * Time Calculation Reference:
 * ===========================
 * The following time calculations are supported for monitoring and analytics:
 * 
 * 1. Tiempo de Atención (Attention Time):
 *    Duration from appointment start (PreGate) to current time
 *    Formula: Now - PreGate
 * 
 * 2. Tiempo Stage (Stage Time):
 *    Duration from when container entered current stage to current time
 *    Formula: Now - [current stage timestamp]
 * 
 */
export class AppointmentInProgressDto {
  cita: string;
  fechaCita: Date | null;
  fechaStage: Date | null;
  fechaPreGate: Date | null;
  fechaGateIn: Date | null;
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
  puertoDescarga: string | null;
}

export class AppointmentsResponseDto {
  data: AppointmentInProgressDto[];
  count: number;
  timestamp: Date;
}

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
  codigo?: string;
  fechaCita: Date | null;
  fechaStage: Date | null;
  fechaPreGate: Date | null;
  fechaGateIn: Date | null;
  fechaZonaEspera: Date | null;
  fechaInicioCarguio: Date | null;
  fechaYard: Date | null;
  fechaGateOut: Date | null;
  stage: string;
  tiempo: number | null;
  tiempoGateIn: number | null;
  deducibleEsperaInicioCarguio: number;
  deducibleInicioCarguioTermino: number;
  tiempoEfectivo: number | null;
  linea: string;
  booking: string;
  permiso: string;
  placa: string;
  tracto: string;
  cliente: string;
  tecnologia: string;
  producto: string;
  contenedor: string;
  nave: string;
  carreta: string;
  chassis: string;
  tipo: string;
  tipoOperativa: string;
  puertoDescarga: string | null;
}

export class AppointmentsResponseDto {
  data: AppointmentInProgressDto[];
  count: number;
  timestamp: Date;
}

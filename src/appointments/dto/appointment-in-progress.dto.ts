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
 * 3. Tiempo Efectivo (Effective Time):
 *    Net handling time excluding inspection duration
 *    Formula: (Now - GateIn) - tiempoEir
 *    Only calculated when tiempoEir is not NULL
 * 
 * The tiempoEir field stores inspection duration in minutes and is used
 * to calculate the actual operational time without inspection delays.
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
  /**
   * Inspection time duration in minutes from CUSTOM_INSPEIR.
   * NULL if no inspection records exist for the container's UFV.
   * 
   * This value represents the time spent in inspection and is subtracted
   * from the total gate-in time to calculate the effective handling time.
   */
  tiempoEir?: number | null;
  puertoDescarga: string | null;
}

export class AppointmentsResponseDto {
  data: AppointmentInProgressDto[];
  count: number;
  timestamp: Date;
}

import { Controller, Get } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsResponseDto } from './dto/appointment-in-progress.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) { }

  /**
   * Get all appointments currently in progress
   * Data is refreshed every 30 seconds by background job
   */
  @Get('in-progress')
  async getAppointmentsInProgress(): Promise<AppointmentsResponseDto> {
    return this.appointmentsService.getAppointmentsInProgress();
  }
}

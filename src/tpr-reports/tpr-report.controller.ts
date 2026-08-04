import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Privilege, Role } from '@prisma/client';
import type { Response } from 'express';
import { GetUser } from '../auth/decorators/active-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { ActiveUser } from '../auth/interfaces/jwt-payload.interface';
import { Privileges } from '../auth/decorators/privileges.decorator';
import {
  RegenerateTprReportDto,
  TprDetailExportQueryDto,
  TprDetailQueryDto,
  TprSummaryQueryDto,
} from './dto/tpr-report.dto';
import { TprReportExcelService } from './tpr-report-excel.service';
import { TprReportService } from './tpr-report.service';

@Controller('tpr-reports')
@Privileges(Privilege.VIEW_TPR_REPORT)
export class TprReportController {
  constructor(
    private readonly reportService: TprReportService,
    private readonly excelService: TprReportExcelService,
  ) {}

  @Get('summary/export')
  async exportSummary(
    @Query() query: TprSummaryQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.reportService.getSummary(
      query.period,
      query.type,
    );
    await this.excelService.exportSummary(response, report);
  }

  @Get('details/export')
  async exportDetails(
    @Query() query: TprDetailExportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.excelService.exportDetails(
      response,
      query.period,
      query.reportType,
      query.uniqueId,
    );
  }

  @Get('summary')
  getSummary(@Query() query: TprSummaryQueryDto) {
    return this.reportService.getSummary(query.period, query.type);
  }

  @Get('details')
  getDetails(@Query() query: TprDetailQueryDto) {
    return this.reportService.getDetails(
      query.period,
      query.reportType,
      query.uniqueId,
      query.page,
      query.limit,
    );
  }

  @Post('regenerate')
  @Roles(Role.ADMIN)
  regenerate(
    @Body() body: RegenerateTprReportDto,
    @GetUser() user: ActiveUser,
  ) {
    return this.reportService.regenerate(body.period, user);
  }
}

import { Module } from '@nestjs/common';
import { TprReportController } from './tpr-report.controller';
import { TprReportExcelService } from './tpr-report-excel.service';
import { TprReportRepository } from './tpr-report.repository';
import { TprReportService } from './tpr-report.service';

@Module({
  controllers: [TprReportController],
  providers: [TprReportRepository, TprReportService, TprReportExcelService],
  exports: [TprReportService],
})
export class TprReportModule {}

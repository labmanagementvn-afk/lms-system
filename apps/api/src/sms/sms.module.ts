import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { ReportsModule } from '../reports/reports.module';
import { SmsDispatcher } from './sms-dispatcher.service';
import { SmsController } from './sms.controller';
import { SmsReports } from './sms.reports';
import { SmsService } from './sms.service';

/**
 * Tin nhắn SMS to parents and teachers: templates, scheduled sending through the
 * SMS channel adapter of the notifications module, and monthly quotas per class.
 */
@Module({
  imports: [AcademicYearsModule, ReportsModule],
  controllers: [SmsController],
  providers: [SmsService, SmsDispatcher, SmsReports],
  exports: [SmsService],
})
export class SmsModule {}

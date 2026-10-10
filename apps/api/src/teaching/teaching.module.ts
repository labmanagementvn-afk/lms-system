import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { ReportsModule } from '../reports/reports.module';
import { AssignmentsService } from './assignments.service';
import { CalendarService } from './calendar.service';
import { DutiesService } from './duties.service';
import { TeachingController } from './teaching.controller';
import { TeachingReports } from './teaching.reports';

/** Phân công chuyên môn, kiêm nhiệm, định mức tiết dạy and lịch báo giảng. */
@Module({
  imports: [AcademicYearsModule, ReportsModule],
  controllers: [TeachingController],
  providers: [AssignmentsService, DutiesService, CalendarService, TeachingReports],
  exports: [AssignmentsService],
})
export class TeachingModule {}

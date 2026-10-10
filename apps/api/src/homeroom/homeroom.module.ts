import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { GradesModule } from '../grades/grades.module';
import { ReportsModule } from '../reports/reports.module';
import { AbsenceController, ParentAbsenceController } from './absence.controller';
import { AbsenceService } from './absence.service';
import { HomeroomAccessService } from './homeroom-access.service';
import { HomeroomBookController } from './homeroom-book.controller';
import { HomeroomBookReports } from './homeroom-book.reports';
import { HomeroomBookService } from './homeroom-book.service';
import { HomeroomController, LogbookController } from './homeroom.controller';
import { HomeroomService } from './homeroom.service';
import { LogbookService } from './logbook.service';

/** Điểm danh lớp (homeroom roll call) with đơn xin nghỉ học, sổ đầu bài (lesson logbook) and sổ chủ nhiệm. */
@Module({
  imports: [AcademicYearsModule, GradesModule, ReportsModule],
  controllers: [HomeroomController, AbsenceController, ParentAbsenceController, LogbookController, HomeroomBookController],
  providers: [HomeroomAccessService, HomeroomService, AbsenceService, LogbookService, HomeroomBookService, HomeroomBookReports],
  exports: [HomeroomService, LogbookService],
})
export class HomeroomModule {}

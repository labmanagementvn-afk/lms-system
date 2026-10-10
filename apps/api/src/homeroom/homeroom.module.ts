import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { AbsenceController, ParentAbsenceController } from './absence.controller';
import { AbsenceService } from './absence.service';
import { HomeroomAccessService } from './homeroom-access.service';
import { HomeroomController, LogbookController } from './homeroom.controller';
import { HomeroomService } from './homeroom.service';
import { LogbookService } from './logbook.service';

/** Điểm danh lớp (homeroom roll call) with đơn xin nghỉ học, and sổ đầu bài (lesson logbook). */
@Module({
  imports: [AcademicYearsModule],
  controllers: [HomeroomController, AbsenceController, ParentAbsenceController, LogbookController],
  providers: [HomeroomAccessService, HomeroomService, AbsenceService, LogbookService],
  exports: [HomeroomService, LogbookService],
})
export class HomeroomModule {}

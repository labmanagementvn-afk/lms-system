import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { HomeroomAccessService } from './homeroom-access.service';
import { HomeroomController, LogbookController } from './homeroom.controller';
import { HomeroomService } from './homeroom.service';
import { LogbookService } from './logbook.service';

/** Điểm danh lớp (homeroom roll call) and sổ đầu bài (lesson logbook). */
@Module({
  imports: [AcademicYearsModule],
  controllers: [HomeroomController, LogbookController],
  providers: [HomeroomAccessService, HomeroomService, LogbookService],
  exports: [HomeroomService, LogbookService],
})
export class HomeroomModule {}

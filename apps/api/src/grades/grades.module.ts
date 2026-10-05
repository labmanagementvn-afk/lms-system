import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { GradesController, ParentGradesController, StudentGradesController } from './grades.controller';
import { GradesService } from './grades.service';

/** Sổ điểm per Thông tư 22/2021: marks, averages, levels, titles, học bạ. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [GradesController, StudentGradesController, ParentGradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}

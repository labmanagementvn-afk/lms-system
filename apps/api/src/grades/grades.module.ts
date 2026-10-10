import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { GradeControlController, GradesController, ParentGradesController, StudentGradesController } from './grades.controller';
import { GradeControlService } from './control.service';
import { GradesService } from './grades.service';

/** Sổ điểm per Thông tư 22/2021: marks, averages, levels, titles, học bạ. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [GradesController, GradeControlController, StudentGradesController, ParentGradesController],
  providers: [GradesService, GradeControlService],
  exports: [GradesService, GradeControlService],
})
export class GradesModule {}

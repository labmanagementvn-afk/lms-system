import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { GradesModule } from '../grades/grades.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Official reports (PDF / Excel) with the school's letterhead and signer. */
@Module({
  imports: [AcademicYearsModule, GradesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

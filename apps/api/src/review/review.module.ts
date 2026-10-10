import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { GradesModule } from '../grades/grades.module';
import { ReportsModule } from '../reports/reports.module';
import { CompletionService } from './completion.service';
import { CompletionController, ReviewController } from './review.controller';
import { ReviewReports } from './review.reports';
import { ReviewService } from './review.service';

/**
 * The end of the school year: retakes and summer training (Điều 12 to 14
 * TT22), the promotion that follows, and the THCS completion review.
 */
@Module({
  imports: [AcademicYearsModule, GradesModule, ReportsModule],
  controllers: [ReviewController, CompletionController],
  providers: [ReviewService, CompletionService, ReviewReports],
})
export class ReviewModule {}

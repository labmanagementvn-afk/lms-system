import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { DiscussionsService } from './discussions.service';
import { LiveService } from './live.service';
import { LmsAccessService } from './lms-access.service';
import { LmsContentController, LmsCoursesController, LmsLiveController, LmsReportsController } from './lms.controller';
import { ReportsService } from './reports.service';
import { StudentLmsController } from './student-lms.controller';
import { StudentLmsService } from './student-lms.service';

/** E-learning: courses with sections and lessons, enrolment and progress, boards, live rooms, reports. */
@Module({
  controllers: [LmsCoursesController, LmsContentController, LmsLiveController, LmsReportsController, StudentLmsController],
  providers: [LmsAccessService, CoursesService, DiscussionsService, LiveService, ReportsService, StudentLmsService],
  exports: [CoursesService, DiscussionsService, LiveService],
})
export class LmsModule {}

import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsScheduler } from './announcements.scheduler';
import { AnnouncementsService } from './announcements.service';

/** Thông báo & sự kiện: announcements and events sent to parents, staff and classes, with RSVP. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementsScheduler],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}

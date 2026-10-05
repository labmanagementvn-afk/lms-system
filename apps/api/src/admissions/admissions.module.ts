import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { AdmissionsController, ParentServicesController, PublicAdmissionsController, ServicesController } from './admissions.controller';
import { ApplicationsService } from './applications.service';
import { RegistrationsService } from './registrations.service';
import { RoundsService } from './rounds.service';

/** Admissions (tuyển sinh) and start-of-year service registration. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [AdmissionsController, ServicesController, PublicAdmissionsController, ParentServicesController],
  providers: [RoundsService, ApplicationsService, RegistrationsService],
  exports: [ApplicationsService, RegistrationsService],
})
export class AdmissionsModule {}

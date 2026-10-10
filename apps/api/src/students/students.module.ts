import { Global, Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { ReportsModule } from '../reports/reports.module';
import { MeritsService } from './merits.service';
import { MovementsService } from './movements.service';
import { StudentProfileService } from './profile.service';
import { ParentMeritsController, StudentRecordsController } from './records.controller';
import { StudentAccessService } from './student-access.service';
import { StudentAccountsController, StudentMeController } from './student-accounts.controller';
import { StudentAccountsService } from './student-accounts.service';
import { StudentsController } from './students.controller';
import { StudentsReports } from './students.reports';
import { StudentsService } from './students.service';

@Global()
@Module({
  imports: [AcademicYearsModule, ReportsModule],
  // Account and record routes go first so "students/accounts" or "students/awards" is not swallowed by "students/:id".
  controllers: [StudentAccountsController, StudentMeController, StudentRecordsController, ParentMeritsController, StudentsController],
  providers: [StudentsService, StudentAccountsService, StudentAccessService, MovementsService, MeritsService, StudentProfileService, StudentsReports],
  exports: [StudentAccessService],
})
export class StudentsModule {}

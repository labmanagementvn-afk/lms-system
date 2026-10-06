import { Global, Module } from '@nestjs/common';
import { StudentAccessService } from './student-access.service';
import { StudentAccountsController, StudentMeController } from './student-accounts.controller';
import { StudentAccountsService } from './student-accounts.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Global()
@Module({
  // Account routes go first so "students/accounts" is not swallowed by "students/:id".
  controllers: [StudentAccountsController, StudentMeController, StudentsController],
  providers: [StudentsService, StudentAccountsService, StudentAccessService],
  exports: [StudentAccessService],
})
export class StudentsModule {}

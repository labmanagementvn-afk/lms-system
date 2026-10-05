import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountingModule } from './accounting/accounting.module';
import { AcademicYearsModule } from './academic-years/academic-years';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { CanteenModule } from './canteen/canteen.module';
import { ClassesModule } from './classes/classes.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { LibraryModule } from './library/library.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { StudentsModule } from './students/students.module';
import { StoreModule } from './store/store.module';
import { SubjectsModule } from './subjects/subjects';
import { TeachersModule } from './teachers/teachers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AcademicYearsModule,
    SubjectsModule,
    TeachersModule,
    StudentsModule,
    ClassesModule,
    SchedulesModule,
    AttendanceModule,
    AccountingModule,
    FinanceModule,
    StoreModule,
    CanteenModule,
    LibraryModule,
    HealthModule,
  ],
})
export class AppModule {}

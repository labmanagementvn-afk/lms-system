import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountingModule } from './accounting/accounting.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { AssetsModule } from './assets/assets.module';
import { AcademicYearsModule } from './academic-years/academic-years';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BusModule } from './bus/bus.module';
import { CanteenModule } from './canteen/canteen.module';
import { ClassesModule } from './classes/classes.module';
import { DistrictModule } from './district/district.module';
import { ConductModule } from './conduct/conduct.module';
import { FinanceModule } from './finance/finance.module';
import { GradesModule } from './grades/grades.module';
import { HealthModule } from './health/health.module';
import { HomeroomModule } from './homeroom/homeroom.module';
import { HrModule } from './hr/hr.module';
import { LibraryModule } from './library/library.module';
import { LmsModule } from './lms/lms.module';
import { MoetModule } from './moet/moet.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ParentsModule } from './parents/parents.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { StatsModule } from './stats/stats.module';
import { StudentsModule } from './students/students.module';
import { StoreModule } from './store/store.module';
import { SubjectsModule } from './subjects/subjects';
import { TeachersModule } from './teachers/teachers.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // Phase 5 hardening first so its guard and interceptor wrap every route.
    PlatformModule,
    AuditModule,
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
    // Phase 3
    NotificationsModule,
    ParentsModule,
    HomeroomModule,
    AnnouncementsModule,
    BusModule,
    AdmissionsModule,
    HrModule,
    AssetsModule,
    // Phase 4
    UploadsModule,
    GradesModule,
    ConductModule,
    LmsModule,
    AssessmentsModule,
    // Phase 5
    StatsModule,
    DistrictModule,
    MoetModule,
    ReportsModule,
  ],
})
export class AppModule {}

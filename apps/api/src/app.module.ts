import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademicYearsModule } from './academic-years/academic-years';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { StudentsModule } from './students/students.module';
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
  ],
})
export class AppModule {}

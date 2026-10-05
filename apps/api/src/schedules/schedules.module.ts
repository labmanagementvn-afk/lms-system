import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({ imports: [AcademicYearsModule], controllers: [SchedulesController], providers: [SchedulesService] })
export class SchedulesModule {}

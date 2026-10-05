import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({ imports: [AcademicYearsModule], controllers: [ClassesController], providers: [ClassesService] })
export class ClassesModule {}

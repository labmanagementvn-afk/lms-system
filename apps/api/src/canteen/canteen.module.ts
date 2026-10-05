import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { CanteenController } from './canteen.controller';
import { CanteenService } from './canteen.service';

@Module({ imports: [AcademicYearsModule], controllers: [CanteenController], providers: [CanteenService] })
export class CanteenModule {}

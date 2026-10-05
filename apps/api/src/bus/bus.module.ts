import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { BusParentController } from './bus-parent.controller';
import { BusController } from './bus.controller';
import { DriverController } from './driver.controller';
import { FleetService } from './fleet.service';
import { RoutesService } from './routes.service';
import { TripSchedulerService } from './trip-scheduler.service';
import { TripsService } from './trips.service';

/** School bus (xe đưa đón): fleet and crew, routes and rosters, daily trips with live location and boarding alerts. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [BusController, DriverController, BusParentController],
  providers: [FleetService, RoutesService, TripsService, TripSchedulerService],
  exports: [TripsService, RoutesService],
})
export class BusModule {}

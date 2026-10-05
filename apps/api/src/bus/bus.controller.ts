import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { BusStaffDto, DateQuery, ReplaceAssignmentsDto, ReplaceStopsDto, RouteDto, UpdateBusStaffDto, UpdateRouteDto, UpdateVehicleDto, VehicleDto } from './bus.dto';
import { FleetService } from './fleet.service';
import { RoutesService } from './routes.service';
import { TripsService } from './trips.service';

/** Fleet, routes, rosters and the day's trips, for the school office. */
@ApiTags('bus')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('bus')
export class BusController {
  constructor(
    private readonly fleet: FleetService,
    private readonly routes: RoutesService,
    private readonly trips: TripsService,
  ) {}

  // ---- Vehicles ----

  @Get('vehicles')
  @ApiOperation({ summary: 'Vehicles with inspection / insurance expiry flags (30 days)' })
  listVehicles(@CurrentUser() user: AuthUser) {
    return this.fleet.listVehicles(user.schoolId);
  }

  @Post('vehicles')
  createVehicle(@CurrentUser() user: AuthUser, @Body() dto: VehicleDto) {
    return this.fleet.createVehicle(user.schoolId, dto);
  }

  @Patch('vehicles/:id')
  updateVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.fleet.updateVehicle(user.schoolId, id, dto);
  }

  @Delete('vehicles/:id')
  removeVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fleet.removeVehicle(user.schoolId, id);
  }

  // ---- Drivers and monitors ----

  @Get('staff')
  listStaff(@CurrentUser() user: AuthUser) {
    return this.fleet.listStaff(user.schoolId);
  }

  @Post('staff')
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: BusStaffDto) {
    return this.fleet.createStaff(user.schoolId, dto);
  }

  @Patch('staff/:id')
  updateStaff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBusStaffDto) {
    return this.fleet.updateStaff(user.schoolId, id, dto);
  }

  @Post('staff/:id/account')
  @ApiOperation({ summary: 'Create the driver-app login; the phone and first-time password are returned once' })
  createAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fleet.createAccount(user.schoolId, id);
  }

  @Post('staff/:id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fleet.resetPassword(user.schoolId, id);
  }

  // ---- Routes, stops and rosters ----

  @Get('routes')
  listRoutes(@CurrentUser() user: AuthUser) {
    return this.routes.list(user.schoolId);
  }

  @Post('routes')
  createRoute(@CurrentUser() user: AuthUser, @Body() dto: RouteDto) {
    return this.routes.create(user.schoolId, dto);
  }

  @Get('routes/:id')
  route(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routes.get(user.schoolId, id);
  }

  @Patch('routes/:id')
  updateRoute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routes.update(user.schoolId, id, dto);
  }

  @Delete('routes/:id')
  removeRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routes.remove(user.schoolId, id);
  }

  @Put('routes/:id/stops')
  @ApiOperation({ summary: 'Replace the ordered stop list; stops sent with their id keep their assignments' })
  replaceStops(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplaceStopsDto) {
    return this.routes.replaceStops(user.schoolId, id, dto);
  }

  @Get('routes/:id/assignments')
  assignments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routes.listAssignments(user.schoolId, id);
  }

  @Put('routes/:id/assignments')
  @ApiOperation({ summary: "Replace the route's roster for the current academic year" })
  replaceAssignments(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplaceAssignmentsDto) {
    return this.routes.replaceAssignments(user.schoolId, id, dto);
  }

  @Delete('routes/:id/assignments/:studentId')
  removeAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.routes.removeAssignment(user.schoolId, id, studentId);
  }

  // ---- Trips ----

  @Get('trips')
  @ApiOperation({ summary: "The day's trips (defaults to today); missing PLANNED trips are created for every active route" })
  listTrips(@CurrentUser() user: AuthUser, @Query() query: DateQuery) {
    return this.trips.list(user.schoolId, query);
  }

  @Get('live')
  @ApiOperation({ summary: "Today's running trips with their last known position" })
  live(@CurrentUser() user: AuthUser) {
    return this.trips.live(user.schoolId);
  }

  @Get('trips/:id')
  trip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.detail(user.schoolId, id);
  }

  @Post('trips/:id/cancel')
  @HttpCode(200)
  cancelTrip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.cancel(user.schoolId, id);
  }

  @Get('trips/:id/locations')
  locations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.locations(user.schoolId, id);
  }
}

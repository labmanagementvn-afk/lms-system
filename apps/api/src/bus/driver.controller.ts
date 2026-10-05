import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { BoardingDto, DateQuery, LocationDto } from './bus.dto';
import { TripsService } from './trips.service';

/** The driver / monitor app: the caller is resolved to their BusStaff record by the linked user. */
@ApiTags('driver app')
@ApiBearerAuth()
@Roles(Role.DRIVER)
@Controller('driver')
export class DriverController {
  constructor(private readonly trips: TripsService) {}

  @Get('trips')
  @ApiOperation({ summary: "The day's trips on the routes the caller drives or monitors" })
  list(@CurrentUser() user: AuthUser, @Query() query: DateQuery) {
    return this.trips.driverTrips(user, query);
  }

  @Get('trips/:id')
  trip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.driverTrip(user, id);
  }

  @Post('trips/:id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.start(user, id);
  }

  @Post('trips/:id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.end(user, id);
  }

  @Post('trips/:id/location')
  @ApiOperation({ summary: 'GPS fix while the trip is running' })
  location(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.trips.location(user, id, dto);
  }

  @Post('trips/:id/boarding')
  @ApiOperation({ summary: 'Record a student getting on or off; their guardians are notified' })
  boarding(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BoardingDto) {
    return this.trips.boarding(user, id, dto);
  }
}

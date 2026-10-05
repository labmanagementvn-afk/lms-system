import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { TripsService } from './trips.service';

/** What a parent sees of their child's bus ride. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class BusParentController {
  constructor(private readonly trips: TripsService) {}

  @Get('children/:id/bus')
  @ApiOperation({ summary: "The child's routes and stops, today's trips and boarding events" })
  bus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.childBus(user, id);
  }
}

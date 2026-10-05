import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ReplacePeriodsDto, TimetableEntryDto, TimetableQuery, UpdateTimetableEntryDto } from './schedules.dto';
import { SchedulesService } from './schedules.service';

@ApiTags('schedules')
@ApiBearerAuth()
@Controller()
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get('periods')
  periods(@CurrentUser() user: AuthUser) {
    return this.service.periods(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('periods')
  replacePeriods(@CurrentUser() user: AuthUser, @Body() dto: ReplacePeriodsDto) {
    return this.service.replacePeriods(user.schoolId, dto.periods);
  }

  @Get('timetable')
  timetable(@CurrentUser() user: AuthUser, @Query() query: TimetableQuery) {
    return this.service.timetable(user.schoolId, query);
  }

  @Roles(Role.ADMIN)
  @Post('timetable')
  create(@CurrentUser() user: AuthUser, @Body() dto: TimetableEntryDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('timetable/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTimetableEntryDto) {
    return this.service.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('timetable/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }
}

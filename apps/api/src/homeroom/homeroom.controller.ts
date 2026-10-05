import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AttendanceQuery, DailyAttendanceQuery, LogbookQuery, LogbookStatsQuery, MonthlyAttendanceQuery, PrefillAttendanceDto, SaveAttendanceDto, SaveLessonLogDto } from './homeroom.dto';
import { HomeroomService } from './homeroom.service';
import { LogbookService } from './logbook.service';

// Điểm danh lớp: the homeroom teacher's roll call. Teachers only reach their own homeroom class.
@ApiTags('homeroom')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('homeroom')
export class HomeroomController {
  constructor(private readonly service: HomeroomService) {}

  @Get('attendance')
  @ApiOperation({ summary: 'Roll-call sheet of a class for one day, with gate data per student' })
  sheet(@CurrentUser() user: AuthUser, @Query() query: AttendanceQuery) {
    return this.service.sheet(user, query);
  }

  @Put('attendance')
  @ApiOperation({ summary: 'Save the roll call; parents are notified of new absences and late arrivals' })
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveAttendanceDto) {
    return this.service.save(user, dto);
  }

  @Post('attendance/prefill')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every unmarked student from the gate terminals (present / late / absent)' })
  prefill(@CurrentUser() user: AuthUser, @Body() dto: PrefillAttendanceDto) {
    return this.service.prefill(user, dto);
  }

  @Get('attendance/summary')
  @ApiOperation({ summary: 'Per-student and per-day totals of a class for one month' })
  monthly(@CurrentUser() user: AuthUser, @Query() query: MonthlyAttendanceQuery) {
    return this.service.monthly(user, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('attendance/daily')
  @ApiOperation({ summary: 'Every class with its roll-call progress for one day (school dashboard)' })
  daily(@CurrentUser() user: AuthUser, @Query() query: DailyAttendanceQuery) {
    return this.service.daily(user.schoolId, query);
  }
}

// Sổ đầu bài: one entry per period taught.
@ApiTags('homeroom')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('homeroom/logbook')
export class LogbookController {
  constructor(private readonly service: LogbookService) {}

  @Get()
  @ApiOperation({ summary: 'Timetable slots of each school day in the range (max 14 days) with their entries' })
  list(@CurrentUser() user: AuthUser, @Query() query: LogbookQuery) {
    return this.service.list(user, query);
  }

  @Put()
  @ApiOperation({ summary: 'Write or update the entry of one period (teachers: periods they teach or their homeroom class)' })
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveLessonLogDto) {
    return this.service.save(user, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Lessons taught / cancelled, average rating and absences per student' })
  stats(@CurrentUser() user: AuthUser, @Query() query: LogbookStatsQuery) {
    return this.service.stats(user, query);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AssignmentsService } from './assignments.service';
import { CalendarService } from './calendar.service';
import { DutiesService } from './duties.service';
import {
  AssignmentCellDto,
  AssignmentQuery,
  CalendarQuery,
  CopyAssignmentsDto,
  DutyQuery,
  DutyTypeDto,
  FromTimetableDto,
  SaveCalendarDto,
  SaveHomeroomDto,
  SemesterQuery,
  TeacherDutyDto,
  UpdateDutyTypeDto,
  UpdateTeacherDutyDto,
  WorkloadSettingDto,
  YearQuery,
} from './teaching.dto';

/**
 * Cán bộ, giáo viên: phân công giảng dạy, phân công chủ nhiệm, chức vụ và kiêm nhiệm,
 * định mức tiết dạy (Thông tư 05/2025/TT-BGDĐT) and lịch báo giảng. Every portal user
 * reads them; the school's leaders (admin) set them, and teachers write their own calendar.
 */
@ApiTags('teaching')
@ApiBearerAuth()
@Controller('teaching')
export class TeachingController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly duties: DutiesService,
    private readonly calendar: CalendarService,
  ) {}

  // ---- phân công giảng dạy ----

  @Get('assignments')
  @ApiOperation({ summary: "A semester's teaching assignments, with the timetable's periods and the suggested periods of each subject" })
  list(@CurrentUser() user: AuthUser, @Query() query: AssignmentQuery) {
    return this.assignments.list(user.schoolId, query);
  }

  @Roles(Role.ADMIN)
  @Put('assignments')
  @ApiOperation({ summary: 'Set who teaches one subject in one class in a semester, and how many periods a week' })
  setCell(@CurrentUser() user: AuthUser, @Body() dto: AssignmentCellDto) {
    return this.assignments.setCell(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Post('assignments/from-timetable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Make assignments from the timetable for the subjects that have none' })
  fromTimetable(@CurrentUser() user: AuthUser, @Body() dto: FromTimetableDto) {
    return this.assignments.fromTimetable(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Post('assignments/copy')
  @HttpCode(200)
  @ApiOperation({ summary: "Copy one semester's assignments to the other where it has none" })
  copy(@CurrentUser() user: AuthUser, @Body() dto: CopyAssignmentsDto) {
    return this.assignments.copy(user.schoolId, dto);
  }

  // ---- phân công chủ nhiệm ----

  @Get('homeroom')
  @ApiOperation({ summary: 'Classes with their homeroom teacher, and teachers with the classes and duties they hold' })
  homeroom(@CurrentUser() user: AuthUser, @Query() query: YearQuery) {
    return this.assignments.homeroom(user.schoolId, query.academicYearId);
  }

  @Roles(Role.ADMIN)
  @Put('homeroom')
  @ApiOperation({ summary: 'Set the homeroom teacher of several classes' })
  saveHomeroom(@CurrentUser() user: AuthUser, @Body() dto: SaveHomeroomDto, @Query() query: YearQuery) {
    return this.assignments.saveHomeroom(user.schoolId, dto, query.academicYearId);
  }

  // ---- chức vụ, kiêm nhiệm ----

  @Get('duty-types')
  @ApiOperation({ summary: "The school's positions and duties with their periods (the circular's list until the school edits it)" })
  types(@CurrentUser() user: AuthUser) {
    return this.duties.types(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Post('duty-types')
  createType(@CurrentUser() user: AuthUser, @Body() dto: DutyTypeDto) {
    return this.duties.createType(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('duty-types/:id')
  updateType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDutyTypeDto) {
    return this.duties.updateType(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('duty-types/:id')
  @HttpCode(204)
  removeType(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.duties.removeType(user.schoolId, id);
  }

  @Get('duties')
  @ApiOperation({ summary: 'Positions and duties held in a school year' })
  dutyList(@CurrentUser() user: AuthUser, @Query() query: DutyQuery) {
    return this.duties.duties(user.schoolId, query);
  }

  @Roles(Role.ADMIN)
  @Post('duties')
  @ApiOperation({ summary: 'Give a teacher a position or duty for the year or one semester' })
  addDuty(@CurrentUser() user: AuthUser, @Body() dto: TeacherDutyDto, @Query() query: YearQuery) {
    return this.duties.addDuty(user.schoolId, dto, query.academicYearId);
  }

  @Roles(Role.ADMIN)
  @Patch('duties/:id')
  updateDuty(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTeacherDutyDto) {
    return this.duties.updateDuty(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('duties/:id')
  @HttpCode(204)
  removeDuty(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.duties.removeDuty(user.schoolId, id);
  }

  // ---- định mức tiết dạy ----

  @Get('workload')
  @ApiOperation({ summary: "Each teacher's norm, reductions, assigned periods and difference in a semester, with the circular's limits checked" })
  workload(@CurrentUser() user: AuthUser, @Query() query: SemesterQuery) {
    return this.duties.workload(user.schoolId, query);
  }

  @Get('workload/settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.duties.settings(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('workload/settings')
  @ApiOperation({ summary: "Set the school's own norms (a boarding school, a school for students with disabilities)" })
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: WorkloadSettingDto) {
    return this.duties.saveSettings(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('workload/settings')
  @ApiOperation({ summary: "Go back to the circular's norms for the school's level" })
  resetSettings(@CurrentUser() user: AuthUser) {
    return this.duties.resetSettings(user.schoolId);
  }

  // ---- lịch báo giảng ----

  @Get('calendar')
  @ApiOperation({ summary: "A teacher's week from the timetable with the lesson planned for each period" })
  week(@CurrentUser() user: AuthUser, @Query() query: CalendarQuery) {
    return this.calendar.week(user, query);
  }

  @Put('calendar')
  @ApiOperation({ summary: 'Write the lessons of some periods (the teacher, or a school leader); an empty title clears a period' })
  saveWeek(@CurrentUser() user: AuthUser, @Body() dto: SaveCalendarDto) {
    return this.calendar.save(user, dto);
  }
}

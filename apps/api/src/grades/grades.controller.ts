import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ParentAccessService } from '../parents/parent-access.service';
import { StudentAccessService } from '../students/student-access.service';
import { AcademicYearsService } from '../academic-years/academic-years';
import { BookQuery, LockDto, RecomputeDto, ResultsQuery, SaveBookDto, SemesterQuery, SubjectSettingDto, TranscriptQuery, UpdateResultDto } from './grades.dto';
import { GradesService } from './grades.service';

const CSV = 'text/csv; charset=utf-8';

// Sổ điểm, kết quả học tập and học bạ for the school portal.
@ApiTags('grades')
@ApiBearerAuth()
@Controller('grades')
export class GradesController {
  constructor(private readonly service: GradesService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Every subject with how it is assessed and how many regular marks it has' })
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user.schoolId);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put('settings/:subjectId')
  @ApiOperation({ summary: 'Set assessment type, regular-mark count and periods per year of a subject' })
  saveSetting(@CurrentUser() user: AuthUser, @Param('subjectId') subjectId: string, @Body() dto: SubjectSettingDto) {
    return this.service.saveSetting(user.schoolId, subjectId, dto);
  }

  @Get('book')
  @ApiOperation({ summary: 'Gradebook of one class, subject and semester with live averages' })
  book(@CurrentUser() user: AuthUser, @Query() query: BookQuery) {
    return this.service.book(user.schoolId, query);
  }

  @Put('book')
  @ApiOperation({ summary: 'Upsert marks; recomputes results and alerts families of GK/CK changes' })
  saveBook(@CurrentUser() user: AuthUser, @Body() dto: SaveBookDto) {
    return this.service.saveBook(user, dto);
  }

  @Get('book/export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="so-diem.csv"')
  exportBook(@CurrentUser() user: AuthUser, @Query() query: BookQuery) {
    return this.service.exportBook(user.schoolId, query);
  }

  @Get('results')
  @ApiOperation({ summary: 'Subject averages, academic and conduct levels, titles and promotion of a class' })
  results(@CurrentUser() user: AuthUser, @Query() query: ResultsQuery) {
    return this.service.results(user.schoolId, query);
  }

  @Get('results/export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="ket-qua-hoc-tap.csv"')
  exportResults(@CurrentUser() user: AuthUser, @Query() query: ResultsQuery) {
    return this.service.exportResults(user.schoolId, query);
  }

  @Post('results/recompute')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recompute subject and term results of a class from its marks' })
  recompute(@CurrentUser() user: AuthUser, @Body() dto: RecomputeDto) {
    return this.service.recompute(user.schoolId, dto.classId, dto.semester);
  }

  @Put('results/:studentId')
  @ApiOperation({ summary: 'Absent days, homeroom comment and promotion override (office or the homeroom teacher)' })
  updateResult(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: UpdateResultDto) {
    return this.service.updateResult(user, studentId, dto);
  }

  @Roles(Role.ADMIN)
  @Post('lock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Freeze the marks of a class for a semester' })
  lock(@CurrentUser() user: AuthUser, @Body() dto: LockDto) {
    return this.service.lock(user, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('lock')
  @ApiOperation({ summary: 'Reopen the marks of a class for a semester' })
  unlock(@CurrentUser() user: AuthUser, @Body() dto: LockDto) {
    return this.service.unlock(user.schoolId, dto);
  }

  @Get('transcript/:studentId')
  @ApiOperation({ summary: 'Học bạ: subject results of both semesters and the year with term results' })
  transcript(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Query() query: TranscriptQuery) {
    return this.service.transcript(user.schoolId, studentId, query.academicYearId);
  }
}

/** What a signed-in student sees of their own marks. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student')
export class StudentGradesController {
  constructor(
    private readonly service: GradesService,
    private readonly access: StudentAccessService,
  ) {}

  @Get('grades')
  @ApiOperation({ summary: 'Own marks, averages and term result for a semester (0 = the year)' })
  async grades(@CurrentUser() user: AuthUser, @Query() query: SemesterQuery) {
    const s = await this.access.current(user);
    return this.service.studentGrades(user.schoolId, { id: s.id, code: s.code, fullName: s.fullName }, s.class, s.academicYear?.id ?? null, query.semester ?? 1);
  }
}

/** What a parent sees of a child's marks. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class ParentGradesController {
  constructor(
    private readonly service: GradesService,
    private readonly access: ParentAccessService,
    private readonly years: AcademicYearsService,
  ) {}

  @Get('children/:id/grades')
  @ApiOperation({ summary: "The child's marks, averages and term result for a semester (0 = the year)" })
  async grades(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: SemesterQuery) {
    const child = await this.access.assertChild(user, id);
    const year = await this.years.current(user.schoolId);
    return this.service.studentGrades(user.schoolId, { id: child.id, code: child.code, fullName: child.fullName }, child.class, year.id, query.semester ?? 1);
  }
}

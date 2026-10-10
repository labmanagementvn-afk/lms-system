import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ParentAccessService } from '../parents/parent-access.service';
import { StudentAccessService } from '../students/student-access.service';
import { AcademicYearsService } from '../academic-years/academic-years';
import { BookQuery, LockDto, RecomputeDto, ResultsQuery, SaveBookDto, SemesterQuery, SubjectSettingDto, TranscriptQuery, UpdateResultDto } from './grades.dto';
import { GradesService } from './grades.service';
import { ColumnLockDto, ColumnLockQuery, EditLogQuery, EntryWindowDto, ExemptionDto, ExemptionQuery, ImportBookQuery, MissingQuery, MonitorQuery, VisibilityDto } from './control.dto';
import { GradeControlService } from './control.service';

const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

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
    return this.service.bookFor(user, query);
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

  @Post('book/import')
  @HttpCode(200)
  @ApiOperation({ summary: 'Import marks from an .xlsx gradebook (Mã HS, TX1..n, GK, CK, Ghi chú); dryRun only checks' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES } }))
  importBook(@CurrentUser() user: AuthUser, @Query() query: ImportBookQuery, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    return this.service.importBook(user, query, file.buffer);
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

/** Gradebook control for the office: column locks, entry window, edit log, monitoring, exemptions, visibility. */
@ApiTags('grades')
@ApiBearerAuth()
@Controller('grades')
export class GradeControlController {
  constructor(private readonly control: GradeControlService) {}

  @Get('column-locks')
  @ApiOperation({ summary: 'Locked mark columns of the current year for a semester' })
  locks(@CurrentUser() user: AuthUser, @Query() query: ColumnLockQuery) {
    return this.control.locks(user.schoolId, query.semester, query.gradeLevel);
  }

  @Roles(Role.ADMIN)
  @Post('column-locks')
  @ApiOperation({ summary: 'Lock a mark column (TXn, every TX, GK or CK) of a grade level, in one subject or all' })
  lock(@CurrentUser() user: AuthUser, @Body() dto: ColumnLockDto) {
    return this.control.lock(user, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('column-locks/:id')
  @ApiOperation({ summary: 'Reopen a locked mark column' })
  unlock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.control.unlock(user.schoolId, id);
  }

  @Get('entry-windows')
  @ApiOperation({ summary: 'When teachers may enter marks in each semester and the edit limit' })
  windows(@CurrentUser() user: AuthUser) {
    return this.control.windows(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('entry-windows')
  @ApiOperation({ summary: 'Set the entry window and edit limit of a semester' })
  saveWindow(@CurrentUser() user: AuthUser, @Body() dto: EntryWindowDto) {
    return this.control.saveWindow(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('edits')
  @ApiOperation({ summary: 'Mark edit log (thống kê sửa điểm)' })
  edits(@CurrentUser() user: AuthUser, @Query() query: EditLogQuery) {
    return this.control.edits(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('monitor')
  @ApiOperation({ summary: 'Entry progress per teacher, class and subject (giám sát nhập điểm)' })
  monitor(@CurrentUser() user: AuthUser, @Query() query: MonitorQuery) {
    return this.control.monitor(user.schoolId, query);
  }

  @Get('monitor/missing')
  @ApiOperation({ summary: 'Students of a class with empty mark columns, per subject' })
  missing(@CurrentUser() user: AuthUser, @Query() query: MissingQuery) {
    return this.control.missing(user.schoolId, query);
  }

  @Get('exemptions')
  @ApiOperation({ summary: 'Subject exemptions (miễn học) of the current year' })
  exemptions(@CurrentUser() user: AuthUser, @Query() query: ExemptionQuery) {
    return this.control.exemptions(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('exemptions')
  @ApiOperation({ summary: 'Exempt a student from a subject for a semester or the year; results are recomputed' })
  addExemption(@CurrentUser() user: AuthUser, @Body() dto: ExemptionDto) {
    return this.control.addExemption(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('exemptions/:id')
  @ApiOperation({ summary: 'Remove an exemption; results are recomputed' })
  removeExemption(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.control.removeExemption(user.schoolId, id);
  }

  @Get('visibility')
  @ApiOperation({ summary: 'What the parent and student apps show of grades' })
  visibility(@CurrentUser() user: AuthUser) {
    return this.control.visibility(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('visibility')
  @ApiOperation({ summary: 'Choose what the parent and student apps show of grades' })
  saveVisibility(@CurrentUser() user: AuthUser, @Body() dto: VisibilityDto) {
    return this.control.saveVisibility(user.schoolId, dto);
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
    private readonly control: GradeControlService,
  ) {}

  @Get('grades')
  @ApiOperation({ summary: 'Own marks, averages and term result for a semester (0 = the year)' })
  async grades(@CurrentUser() user: AuthUser, @Query() query: SemesterQuery) {
    const s = await this.access.current(user);
    const visibility = await this.control.visibility(user.schoolId);
    return this.service.studentGrades(user.schoolId, { id: s.id, code: s.code, fullName: s.fullName }, s.class, s.academicYear?.id ?? null, query.semester ?? 1, visibility);
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
    private readonly control: GradeControlService,
  ) {}

  @Get('children/:id/grades')
  @ApiOperation({ summary: "The child's marks, averages and term result for a semester (0 = the year)" })
  async grades(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: SemesterQuery) {
    const child = await this.access.assertChild(user, id);
    const year = await this.years.current(user.schoolId);
    const visibility = await this.control.visibility(user.schoolId);
    return this.service.studentGrades(user.schoolId, { id: child.id, code: child.code, fullName: child.fullName }, child.class, year.id, query.semester ?? 1, visibility);
  }
}

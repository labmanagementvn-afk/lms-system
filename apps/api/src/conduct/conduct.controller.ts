import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ClassQuery, ClassStudentsDto, CriterionDto, OpenClassDto, ReviewDto, SaveCriteriaDto, SelfAssessDto, SemesterMonthQuery, SummaryQuery, UpdateCriterionDto } from './conduct.dto';
import { ConductService } from './conduct.service';
import { CriteriaService } from './criteria.service';

// Tiêu chí rèn luyện: the school's criteria (office edits, everyone in the portal reads).
@ApiTags('conduct')
@ApiBearerAuth()
@Controller('conduct/criteria')
export class ConductCriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get()
  @ApiOperation({ summary: "The school's criteria; the defaults are created on first read" })
  list(@CurrentUser() user: AuthUser) {
    return this.criteria.list(user.schoolId);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put()
  @ApiOperation({ summary: 'Replace the whole list (active points must add up to 100)' })
  saveAll(@CurrentUser() user: AuthUser, @Body() dto: SaveCriteriaDto) {
    return this.criteria.saveAll(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CriterionDto) {
    return this.criteria.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCriterionDto) {
    return this.criteria.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a criterion; one already scored is deactivated instead' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.criteria.remove(user.schoolId, id);
  }
}

// Đánh giá rèn luyện theo lớp: open, review (homeroom teacher), approve and reopen (office).
@ApiTags('conduct')
@ApiBearerAuth()
@Controller('conduct')
export class ConductController {
  constructor(private readonly service: ConductService) {}

  @Get('class')
  @ApiOperation({ summary: 'Students of a class with their assessment for the semester (month 0) or month' })
  classView(@CurrentUser() user: AuthUser, @Query() query: ClassQuery) {
    return this.service.classView(user, query);
  }

  @Post('class/open')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create DRAFT assessments for every student of the class without one' })
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenClassDto) {
    return this.service.open(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('class/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve the REVIEWED assessments of the class (or of the given students); semester results go to TermResult' })
  approve(@CurrentUser() user: AuthUser, @Body() dto: ClassStudentsDto) {
    return this.service.approve(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('class/reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send APPROVED assessments back to REVIEWED and clear TermResult.conduct' })
  reopen(@CurrentUser() user: AuthUser, @Body() dto: ClassStudentsDto) {
    return this.service.reopen(user, dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Per class of the current year: assessment statuses and approved levels' })
  summary(@CurrentUser() user: AuthUser, @Query() query: SummaryQuery) {
    return this.service.summary(user.schoolId, query.semester);
  }

  @Get('assessments/:id')
  @ApiOperation({ summary: 'One assessment with its items and criteria' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Put('assessments/:id/review')
  @ApiOperation({ summary: "The homeroom teacher's (or office's) points per criterion; status becomes REVIEWED" })
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.service.review(user, id, dto);
  }
}

/** The student's own self-assessment. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student/conduct')
export class StudentConductController {
  constructor(private readonly service: ConductService) {}

  @Get()
  @ApiOperation({ summary: 'Own assessment with items and criteria; a semester DRAFT is created on first view' })
  get(@CurrentUser() user: AuthUser, @Query() query: SemesterMonthQuery) {
    return this.service.forStudent(user, query);
  }

  @Put('self')
  @ApiOperation({ summary: 'Submit the self-assessment (only before the homeroom teacher reviews)' })
  self(@CurrentUser() user: AuthUser, @Body() dto: SelfAssessDto) {
    return this.service.selfAssess(user, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Every assessment of the student, newest first' })
  history(@CurrentUser() user: AuthUser) {
    return this.service.history(user);
  }
}

/** A parent's read-only view of a child's assessment. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent/children/:id/conduct')
export class ParentConductController {
  constructor(private readonly service: ConductService) {}

  @Get()
  @ApiOperation({ summary: "The child's assessment for the semester (month 0) or month, with history" })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: SemesterMonthQuery) {
    return this.service.forParent(user, id, query);
  }
}

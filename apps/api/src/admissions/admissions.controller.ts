import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApplicationSource, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import {
  ApplicationDto,
  ApplicationQuery,
  ApplicationStatusDto,
  BulkEnrolDto,
  ClassFilterQuery,
  EnrolDto,
  ImportApplicationsDto,
  PublicLookupQuery,
  RoundDto,
  RoundFilterQuery,
  ServiceQuery,
  ServiceRegistrationDto,
  UpdateApplicationDto,
  UpdateRoundDto,
} from './admissions.dto';
import { ApplicationsService } from './applications.service';
import { RegistrationsService } from './registrations.service';
import { RoundsService } from './rounds.service';

const CSV = 'text/csv; charset=utf-8';

/** Admission rounds and applications, for the school office. */
@ApiTags('admissions')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('admissions')
export class AdmissionsController {
  constructor(
    private readonly rounds: RoundsService,
    private readonly applications: ApplicationsService,
  ) {}

  @Get('rounds')
  @ApiOperation({ summary: 'Rounds with application counts by status and seats taken against the capacity' })
  listRounds(@CurrentUser() user: AuthUser) {
    return this.rounds.list(user.schoolId);
  }

  @Post('rounds')
  createRound(@CurrentUser() user: AuthUser, @Body() dto: RoundDto) {
    return this.rounds.create(user.schoolId, dto);
  }

  @Patch('rounds/:id')
  updateRound(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoundDto) {
    return this.rounds.update(user.schoolId, id, dto);
  }

  @Post('rounds/:id/close')
  @HttpCode(200)
  closeRound(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rounds.close(user.schoolId, id);
  }

  @Delete('rounds/:id')
  @ApiOperation({ summary: 'Only a round without applications can be deleted' })
  removeRound(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rounds.remove(user.schoolId, id);
  }

  @Get('applications')
  listApplications(@CurrentUser() user: AuthUser, @Query() query: ApplicationQuery) {
    return this.applications.list(user.schoolId, query);
  }

  // Static paths come before ':id' so Express does not read "export" as an id.
  @Get('applications/export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="ho-so-tuyen-sinh.csv"')
  exportApplications(@CurrentUser() user: AuthUser, @Query() query: RoundFilterQuery) {
    return this.applications.exportCsv(user.schoolId, query.roundId);
  }

  @Post('applications/import')
  @HttpCode(200)
  @ApiOperation({ summary: 'Import applications from CSV text; returns { created, skipped, errors }' })
  importApplications(@CurrentUser() user: AuthUser, @Body() dto: ImportApplicationsDto) {
    return this.applications.importCsv(user.schoolId, dto);
  }

  @Post('applications/bulk-enrol')
  @HttpCode(200)
  bulkEnrol(@CurrentUser() user: AuthUser, @Body() dto: BulkEnrolDto) {
    return this.applications.bulkEnrol(user.schoolId, dto, user.userId);
  }

  @Post('applications')
  @ApiOperation({ summary: 'Add an application by hand (source MANUAL)' })
  createApplication(@CurrentUser() user: AuthUser, @Body() dto: ApplicationDto) {
    return this.applications.create(user.schoolId, dto, ApplicationSource.MANUAL);
  }

  @Get('applications/:id')
  getApplication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.get(user.schoolId, id);
  }

  @Patch('applications/:id')
  updateApplication(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    return this.applications.update(user.schoolId, id, dto);
  }

  @Post('applications/:id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'SUBMITTED→SCREENING, SCREENING→ACCEPTED/REJECTED, SUBMITTED/SCREENING/ACCEPTED→WITHDRAWN' })
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApplicationStatusDto) {
    return this.applications.setStatus(user.schoolId, id, dto);
  }

  @Post('applications/:id/enrol')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create the student, guardian and enrolment from an accepted application' })
  enrol(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EnrolDto) {
    return this.applications.enrol(user.schoolId, id, dto.classId, user.userId);
  }
}

/** Start-of-year service registrations, for the school office. */
@ApiTags('admissions')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('admissions/services')
export class ServicesController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ServiceQuery) {
    return this.registrations.list(user.schoolId, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: ClassFilterQuery) {
    return this.registrations.summary(user.schoolId, query.classId);
  }

  @Get('export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="dang-ky-dich-vu.csv"')
  export(@CurrentUser() user: AuthUser, @Query() query: ClassFilterQuery) {
    return this.registrations.exportCsv(user.schoolId, query.classId);
  }

  @Put('student/:studentId')
  @ApiOperation({ summary: 'Staff edit of a registration; keeps its status' })
  save(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: ServiceRegistrationDto) {
    return this.registrations.saveByStaff(user, studentId, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.registrations.confirm(user.schoolId, id);
  }
}

/** The public application form: no account needed. */
@ApiTags('public')
@Public()
@Controller('public/admissions')
export class PublicAdmissionsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get(':schoolCode')
  @ApiOperation({ summary: 'The school and its rounds currently accepting applications' })
  info(@Param('schoolCode') schoolCode: string) {
    return this.applications.publicInfo(schoolCode);
  }

  @Post(':schoolCode/applications')
  submit(@Param('schoolCode') schoolCode: string, @Body() dto: ApplicationDto) {
    return this.applications.publicSubmit(schoolCode, dto);
  }

  @Get(':schoolCode/applications/:code')
  @ApiOperation({ summary: 'Application status by code; the guardian phone must match' })
  lookup(@Param('schoolCode') schoolCode: string, @Param('code') code: string, @Query() query: PublicLookupQuery) {
    return this.applications.publicLookup(schoolCode, code, query.phone);
  }
}

/** A parent's service registration for one of their children. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent/children/:id/services')
export class ParentServicesController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  @ApiOperation({ summary: 'The registration for the current academic year, or null' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.registrations.forParent(user, id);
  }

  @Put()
  @ApiOperation({ summary: 'Submit or change the registration; refused once the school confirmed it' })
  save(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ServiceRegistrationDto) {
    return this.registrations.submitByParent(user, id, dto);
  }
}

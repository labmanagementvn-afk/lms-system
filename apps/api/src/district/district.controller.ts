import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditQuery } from '../audit/audit.dto';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AlertRulesService } from '../stats/alert-rules.service';
import { AlertEventQuery, CreateAlertRuleDto, DaysQuery, UpdateAlertRuleDto } from '../stats/stats.dto';
import { CreateOfficerDto, DistrictDateQuery, UpdateOfficerDto, UpdateSchoolDto } from './district.dto';
import { DistrictService } from './district.service';

/** Thông tin trường: the school's own profile and district attachment (ADMIN). */
@ApiTags('district')
@ApiBearerAuth()
@Controller()
export class SchoolSettingsController {
  constructor(private readonly service: DistrictService) {}

  @Get('districts')
  @ApiOperation({ summary: 'Phòng/Sở GD&ĐT a school can attach itself to' })
  districts() {
    return this.service.districts();
  }

  @Get('school')
  school(@CurrentUser() user: AuthUser) {
    return this.service.school(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Patch('school')
  updateSchool(@CurrentUser() user: AuthUser, @Body() dto: UpdateSchoolDto) {
    return this.service.updateSchool(user.schoolId, dto);
  }
}

/** Cổng Phòng/Sở: cross-school dashboards, alerts, rules, audit trail and officer accounts for DISTRICT users. */
@ApiTags('district')
@ApiBearerAuth()
@Roles(Role.DISTRICT)
@Controller('district')
export class DistrictController {
  constructor(
    private readonly service: DistrictService,
    private readonly alerts: AlertRulesService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'District totals and one line per school for a day' })
  overview(@CurrentUser() user: AuthUser, @Query() query: DistrictDateQuery) {
    return this.service.overview(user, query.date);
  }

  @Get('trend')
  trend(@CurrentUser() user: AuthUser, @Query() query: DaysQuery) {
    return this.service.trend(user, query.days);
  }

  @Get('schools/:id')
  school(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: DaysQuery) {
    return this.service.schoolDetail(user, id, query.days);
  }

  @Get('alerts')
  async alertsList(@CurrentUser() user: AuthUser, @Query() query: AlertEventQuery) {
    const { schoolIds } = await this.service.scope(user);
    return this.alerts.events({ schoolIds }, query);
  }

  @Post('alerts/:id/ack')
  @HttpCode(200)
  async ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { schoolIds } = await this.service.scope(user);
    return this.alerts.acknowledge({ schoolIds }, id, user.userId);
  }

  @Get('rules')
  @ApiOperation({ summary: 'District-wide alert rules (applied to every school of the district)' })
  async rules(@CurrentUser() user: AuthUser) {
    const { district } = await this.service.scope(user);
    return this.alerts.rules({ districtId: district.id });
  }

  @Post('rules')
  async createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertRuleDto) {
    const { district } = await this.service.scope(user);
    return this.alerts.createRule({ districtId: district.id }, dto);
  }

  @Patch('rules/:id')
  async updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAlertRuleDto) {
    const { district } = await this.service.scope(user);
    return this.alerts.updateRule({ districtId: district.id }, id, dto);
  }

  @Delete('rules/:id')
  async deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { district } = await this.service.scope(user);
    return this.alerts.deleteRule({ districtId: district.id }, id);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Audit trail of the district’s schools and officers' })
  async auditList(@CurrentUser() user: AuthUser, @Query() query: AuditQuery) {
    const { district, schoolIds } = await this.service.scope(user);
    return this.audit.list({ districtId: district.id, schoolIds }, query);
  }

  @Get('users')
  officers(@CurrentUser() user: AuthUser) {
    return this.service.officers(user);
  }

  @Post('users')
  createOfficer(@CurrentUser() user: AuthUser, @Body() dto: CreateOfficerDto) {
    return this.service.createOfficer(user, dto);
  }

  @Patch('users/:id')
  updateOfficer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOfficerDto) {
    return this.service.updateOfficer(user, id, dto);
  }
}

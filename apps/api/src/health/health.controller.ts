import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import {
  HealthCheckDto,
  HealthCheckQuery,
  HealthProfileDto,
  IncidentDto,
  IncidentQuery,
  InsuranceQuery,
  UpdateHealthCheckDto,
  UpdateIncidentDto,
  VaccinationDto,
} from './health.dto';
import { HealthService } from './health.service';

// Medical data about minors: school office only, never teachers.
@ApiTags('health')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get('students/:studentId')
  record(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.record(user.schoolId, studentId);
  }

  @Put('students/:studentId/profile')
  saveProfile(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: HealthProfileDto) {
    return this.service.saveProfile(user.schoolId, studentId, dto);
  }

  @Get('checks')
  listChecks(@CurrentUser() user: AuthUser, @Query() query: HealthCheckQuery) {
    return this.service.listChecks(user.schoolId, query);
  }

  @Post('checks')
  createCheck(@CurrentUser() user: AuthUser, @Body() dto: HealthCheckDto) {
    return this.service.createCheck(user.schoolId, dto);
  }

  @Patch('checks/:id')
  updateCheck(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHealthCheckDto) {
    return this.service.updateCheck(user.schoolId, id, dto);
  }

  @Delete('checks/:id')
  removeCheck(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeCheck(user.schoolId, id);
  }

  @Post('vaccinations')
  createVaccination(@CurrentUser() user: AuthUser, @Body() dto: VaccinationDto) {
    return this.service.createVaccination(user.schoolId, dto);
  }

  @Delete('vaccinations/:id')
  removeVaccination(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeVaccination(user.schoolId, id);
  }

  @Get('incidents')
  listIncidents(@CurrentUser() user: AuthUser, @Query() query: IncidentQuery) {
    return this.service.listIncidents(user.schoolId, query);
  }

  @Post('incidents')
  createIncident(@CurrentUser() user: AuthUser, @Body() dto: IncidentDto) {
    return this.service.createIncident(user.schoolId, user.userId, dto);
  }

  @Patch('incidents/:id')
  updateIncident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.service.updateIncident(user.schoolId, id, dto);
  }

  @Get('insurance-expiring')
  insuranceExpiring(@CurrentUser() user: AuthUser, @Query() query: InsuranceQuery) {
    return this.service.insuranceExpiring(user.schoolId, query);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AlertRulesService } from './alert-rules.service';
import { AlertEventQuery, CreateAlertRuleDto, DateQuery, UpdateAlertRuleDto } from './stats.dto';
import { DailyStatsService } from './daily-stats.service';

/** Cảnh báo: threshold rules on the daily statistics and the events they raised. */
@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alerts: AlertRulesService,
    private readonly stats: DailyStatsService,
  ) {}

  @Get('rules')
  rules(@CurrentUser() user: AuthUser) {
    return this.alerts.rules({ schoolId: user.schoolId });
  }

  @Roles(Role.ADMIN)
  @Post('rules')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertRuleDto) {
    return this.alerts.createRule({ schoolId: user.schoolId }, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('rules/:id')
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAlertRuleDto) {
    return this.alerts.updateRule({ schoolId: user.schoolId }, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('rules/:id')
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.alerts.deleteRule({ schoolId: user.schoolId }, id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Alerts raised for this school (its own rules and the district’s), newest first' })
  events(@CurrentUser() user: AuthUser, @Query() query: AlertEventQuery) {
    return this.alerts.events({ schoolId: user.schoolId }, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('events/:id/ack')
  @HttpCode(200)
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.alerts.acknowledge({ schoolId: user.schoolId }, id, user.userId);
  }

  @Roles(Role.ADMIN)
  @Post('evaluate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recompute one day and check every rule against it now (the nightly job does this for yesterday)' })
  async evaluate(@CurrentUser() user: AuthUser, @Body() dto: DateQuery) {
    const date = dto.date ?? (await this.stats.today(user.schoolId));
    await this.stats.computeDay(user.schoolId, date);
    return { date, ...(await this.alerts.evaluate(user.schoolId, date)) };
  }
}

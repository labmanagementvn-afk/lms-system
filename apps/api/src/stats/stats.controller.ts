import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AlertRulesService } from './alert-rules.service';
import { addDays, aggregateStats, DailyStatsService } from './daily-stats.service';
import { DaysQuery, RangeQuery, RecomputeDto } from './stats.dto';

/** Thống kê ngày: the school's own daily statistics (computed nightly, refreshed through the day). */
@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: DailyStatsService,
    private readonly alerts: AlertRulesService,
  ) {}

  @Get('daily')
  @ApiOperation({ summary: 'Stored daily rows between two dates, oldest first' })
  async daily(@CurrentUser() user: AuthUser, @Query() query: RangeQuery) {
    const to = query.to ?? (await this.stats.today(user.schoolId));
    const from = query.from ?? addDays(to, -13);
    return { from, to, items: await this.stats.range(user.schoolId, from, to) };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Today (recomputed live), the window total and the per-day trend' })
  async summary(@CurrentUser() user: AuthUser, @Query() query: DaysQuery) {
    const today = await this.stats.today(user.schoolId);
    await this.stats.computeDay(user.schoolId, today);
    const trend = await this.stats.trend([user.schoolId], today, query.days);
    const open = await this.alerts.openCount([user.schoolId]);
    return {
      today: trend.at(-1) ?? null,
      window: { days: query.days, from: addDays(today, -(query.days - 1)), to: today, ...aggregateStats(trend.filter((t) => t.schools > 0)) },
      openAlerts: open[user.schoolId] ?? 0,
      trend,
    };
  }

  @Roles(Role.ADMIN)
  @Post('recompute')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recompute the rows of a date range (after correcting attendance or fees) and re-check alert rules' })
  async recompute(@CurrentUser() user: AuthUser, @Body() dto: RecomputeDto) {
    const rows = await this.stats.computeRange(user.schoolId, dto.from, dto.to);
    let created = 0;
    for (let d = dto.from; d <= dto.to; d = addDays(d, 1)) created += (await this.alerts.evaluate(user.schoolId, d)).created;
    return { days: rows.length, alertsCreated: created };
  }
}

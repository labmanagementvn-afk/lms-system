import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AlertsController } from './alerts.controller';
import { AlertRulesService } from './alert-rules.service';
import { DailyStatsService } from './daily-stats.service';
import { StatsController } from './stats.controller';
import { StatsScheduler } from './stats.scheduler';

/** Thống kê & cảnh báo: per-school daily statistics, threshold alerts and the nightly job that computes them. */
@Module({
  imports: [AuditModule],
  controllers: [StatsController, AlertsController],
  providers: [DailyStatsService, AlertRulesService, StatsScheduler],
  exports: [DailyStatsService, AlertRulesService],
})
export class StatsModule {}

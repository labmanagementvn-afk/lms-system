import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { AlertRulesService } from './alert-rules.service';
import { addDays, DailyStatsService } from './daily-stats.service';

/**
 * The "nightly job": every STATS_SCHEDULER_MS (0 disables) it refreshes today's statistics
 * row for every school, and once per local day it finalises yesterday's row, evaluates the
 * alert rules on it and purges audit rows past their retention.
 */
@Injectable()
export class StatsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /** School id -> the last local date whose previous day was finalised. */
  private readonly finalised = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: DailyStatsService,
    private readonly alerts: AlertRulesService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const every = Number(process.env.STATS_SCHEDULER_MS ?? 15 * 60_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.tick(), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const schools = await this.prisma.school.findMany({ select: { id: true, code: true, timezone: true } });
      let alerts = 0;
      for (const school of schools) {
        try {
          const today = localDate(new Date(), school.timezone);
          await this.stats.computeDay(school.id, today);
          if (this.finalised.get(school.id) !== today) {
            const yesterday = addDays(today, -1);
            await this.stats.computeDay(school.id, yesterday);
            alerts += (await this.alerts.evaluate(school.id, yesterday)).created;
            this.finalised.set(school.id, today);
          }
        } catch (e) {
          this.logger.error(`stats for ${school.code} failed: ${(e as Error).message}`);
        }
      }
      if (alerts) this.logger.log(`Raised ${alerts} alert(s)`);
      await this.audit.purge();
    } catch (e) {
      this.logger.error(`scheduler failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertEvent, AlertKind, NotificationKind, Prisma, Role } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateRule, isSchoolDay } from './alert-rules';
import { DailyStatsService, fromDbDate, toDbDate } from './daily-stats.service';
import { AlertEventQuery, CreateAlertRuleDto, UpdateAlertRuleDto } from './stats.dto';

/** Rules belong to a school or to a district (then they apply to every school of it). */
export type RuleOwner = { schoolId: string } | { districtId: string };

export function presentEvent(e: AlertEvent & { rule?: { name: string } | null; school?: { id: string; code: string; name: string } | null }) {
  return { ...e, date: fromDbDate(e.date), value: Number(e.value), threshold: Number(e.threshold) };
}

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: DailyStatsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- rules ----

  rules(owner: RuleOwner) {
    return this.prisma.alertRule.findMany({ where: owner, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], include: { _count: { select: { events: true } } } });
  }

  createRule(owner: RuleOwner, dto: CreateAlertRuleDto) {
    return this.prisma.alertRule.create({ data: { ...owner, kind: dto.kind, name: dto.name, threshold: new Prisma.Decimal(dto.threshold), isActive: dto.isActive ?? true } });
  }

  async updateRule(owner: RuleOwner, id: string, dto: UpdateAlertRuleDto) {
    await this.rule(owner, id);
    return this.prisma.alertRule.update({
      where: { id },
      data: { kind: dto.kind, name: dto.name, threshold: dto.threshold === undefined ? undefined : new Prisma.Decimal(dto.threshold), isActive: dto.isActive },
    });
  }

  async deleteRule(owner: RuleOwner, id: string) {
    await this.rule(owner, id);
    await this.prisma.alertRule.delete({ where: { id } });
    return { ok: true };
  }

  private async rule(owner: RuleOwner, id: string) {
    const r = await this.prisma.alertRule.findFirst({ where: { id, ...owner } });
    if (!r) throw new NotFoundException('Không tìm thấy quy tắc cảnh báo');
    return r;
  }

  // ---- evaluation ----

  /**
   * Checks every active rule of the school (its own and its district's) against the day's
   * statistics. New events notify the school's admins and the district's officers; a rule
   * that already fired for the day only has its value refreshed.
   */
  async evaluate(schoolId: string, date: string): Promise<{ fired: number; created: number }> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true, name: true, districtId: true } });
    const rules = await this.prisma.alertRule.findMany({
      where: { isActive: true, OR: [{ schoolId }, ...(school.districtId ? [{ districtId: school.districtId }] : [])] },
    });
    if (!rules.length) return { fired: 0, created: 0 };
    const day = toDbDate(date);
    const stat = (await this.prisma.dailyStat.findUnique({ where: { schoolId_date: { schoolId, date: day } } })) ?? (await this.stats.computeDay(schoolId, date));
    const input = { ...stat, attendanceRate: Number(stat.attendanceRate) };

    let fired = 0;
    let created = 0;
    for (const rule of rules) {
      const ctx: { absentStreak?: { code: string; fullName: string }[] } = {};
      if (rule.kind === AlertKind.ABSENT_STREAK) {
        if (!isSchoolDay(date)) continue;
        ctx.absentStreak = await this.stats.absentStreak(schoolId, date, Number(rule.threshold));
      }
      const result = evaluateRule({ kind: rule.kind, threshold: Number(rule.threshold) }, input, ctx);
      if (!result.fired) continue;
      fired++;
      const existing = await this.prisma.alertEvent.findUnique({ where: { ruleId_schoolId_date: { ruleId: rule.id, schoolId, date: day } } });
      const data = { kind: rule.kind, value: new Prisma.Decimal(result.value), threshold: rule.threshold, message: result.message };
      if (existing) {
        await this.prisma.alertEvent.update({ where: { id: existing.id }, data });
        continue;
      }
      const event = await this.prisma.alertEvent.create({ data: { ruleId: rule.id, schoolId, date: day, ...data } });
      created++;
      await this.notify(school, event, rule.name, date);
    }
    return { fired, created };
  }

  private async notify(school: { id: string; name: string; districtId: string | null }, event: AlertEvent, ruleName: string, date: string) {
    const input = { kind: NotificationKind.ALERT, title: `Cảnh báo: ${ruleName}`, body: `${school.name}, ngày ${date}: ${event.message}`, data: { alertEventId: event.id, schoolId: school.id, date } };
    try {
      await this.notifications.notifyRoles(school.id, [Role.ADMIN], input);
      if (school.districtId) {
        const officers = await this.prisma.user.findMany({ where: { districtId: school.districtId, role: Role.DISTRICT, isActive: true }, select: { id: true } });
        await this.notifications.notifyUsers(school.id, officers.map((u) => u.id), input);
      }
    } catch (e) {
      this.logger.warn(`alert notification failed: ${(e as Error).message}`);
    }
  }

  // ---- events ----

  async events(scope: { schoolId: string } | { schoolIds: string[] }, query: AlertEventQuery): Promise<Page<unknown>> {
    const where: Prisma.AlertEventWhereInput = {
      schoolId: 'schoolId' in scope ? scope.schoolId : { in: query.schoolId ? scope.schoolIds.filter((id) => id === query.schoolId) : scope.schoolIds },
      kind: query.kind,
      acknowledgedAt: query.open === undefined ? undefined : query.open ? null : { not: null },
      date: query.from || query.to ? { gte: query.from ? toDbDate(query.from) : undefined, lte: query.to ? toDbDate(query.to) : undefined } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.alertEvent.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { rule: { select: { name: true, districtId: true } }, school: { select: { id: true, code: true, name: true } } },
        ...pageArgs(query),
      }),
      this.prisma.alertEvent.count({ where }),
    ]);
    return { items: items.map(presentEvent), total, page: query.page, pageSize: query.pageSize };
  }

  async openCount(schoolIds: string[]): Promise<Record<string, number>> {
    const rows = await this.prisma.alertEvent.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, acknowledgedAt: null }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.schoolId, r._count._all]));
  }

  async acknowledge(scope: { schoolId: string } | { schoolIds: string[] }, id: string, userId: string) {
    const e = await this.prisma.alertEvent.findFirst({ where: { id, schoolId: 'schoolId' in scope ? scope.schoolId : { in: scope.schoolIds } } });
    if (!e) throw new NotFoundException('Không tìm thấy cảnh báo');
    if (e.acknowledgedAt) return presentEvent(e);
    return presentEvent(await this.prisma.alertEvent.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedById: userId } }));
  }
}

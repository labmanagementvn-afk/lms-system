import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQuery } from './audit.dto';

export interface AuditEntry {
  schoolId: string | null;
  districtId: string | null;
  userId: string | null;
  userRole: Role | null;
  method: string;
  path: string;
  area: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  body: unknown;
  durationMs: number;
}

/** Who may read which rows: a school reads its own, a district reads its schools' and its officers'. */
export type AuditScope = { schoolId: string } | { districtId: string; schoolIds: string[] };

export const auditRetentionDays = () => Number(process.env.AUDIT_RETENTION_DAYS ?? 180);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: a failed audit write is logged, never surfaced to the caller. */
  record(entry: AuditEntry) {
    this.write(entry).catch((e: Error) => this.logger.warn(`audit write failed: ${e.message}`));
  }

  private async write(entry: AuditEntry) {
    let { schoolId, districtId } = entry;
    // A sign-in attempt has no token yet; attribute it to the account it named so the
    // school's admins see failed logins against their users.
    if (!schoolId && !districtId && entry.area === 'auth') {
      const target = await this.loginTarget(entry.body);
      if (target) ({ schoolId, districtId } = target);
    }
    await this.prisma.auditLog.create({
      data: {
        ...entry,
        schoolId,
        districtId,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
        path: entry.path.slice(0, 500),
        body: entry.body === undefined ? Prisma.DbNull : (entry.body as Prisma.InputJsonValue),
      },
    });
  }

  private async loginTarget(body: unknown): Promise<{ schoolId: string | null; districtId: string | null } | null> {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const where = typeof b.email === 'string' ? { email: b.email.trim().toLowerCase() } : typeof b.phone === 'string' && normalizePhone(b.phone) ? { phone: normalizePhone(b.phone)! } : typeof b.username === 'string' ? { username: b.username.trim().toLowerCase() } : null;
    if (!where) return null;
    return this.prisma.user.findUnique({ where, select: { schoolId: true, districtId: true } });
  }

  async list(scope: AuditScope, query: AuditQuery): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      ...('schoolId' in scope ? { schoolId: scope.schoolId } : { OR: [{ schoolId: { in: scope.schoolIds } }, { districtId: scope.districtId }] }),
      userId: query.userId,
      area: query.area,
      method: query.method,
      userRole: query.role,
      statusCode: query.failed ? { gte: 400 } : undefined,
      path: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      createdAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? nextDay(query.to) : undefined } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const userIds = [...new Set(items.map((i) => i.userId).filter((x): x is string => !!x))];
    const schoolIds = [...new Set(items.map((i) => i.schoolId).filter((x): x is string => !!x))];
    const [users, schools] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true, username: true, phone: true } }) : [],
      schoolIds.length ? this.prisma.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, code: true, name: true } }) : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const schoolById = new Map(schools.map((s) => [s.id, s]));
    return {
      items: items.map((i) => ({ ...i, user: i.userId ? (userById.get(i.userId) ?? null) : null, school: i.schoolId ? (schoolById.get(i.schoolId) ?? null) : null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Distinct module names seen in the scope, for the filter dropdown. */
  async areas(scope: AuditScope): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: 'schoolId' in scope ? { schoolId: scope.schoolId } : { OR: [{ schoolId: { in: scope.schoolIds } }, { districtId: scope.districtId }] },
      distinct: ['area'],
      select: { area: true },
      orderBy: { area: 'asc' },
    });
    return rows.map((r) => r.area);
  }

  /** Deletes rows older than AUDIT_RETENTION_DAYS; 0 keeps everything. */
  async purge(days = auditRetentionDays()): Promise<number> {
    if (!(days > 0)) return 0;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const { count } = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count) this.logger.log(`Purged ${count} audit row(s) older than ${days} days`);
    return count;
  }
}

function nextDay(date: string): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

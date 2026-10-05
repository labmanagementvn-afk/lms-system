import { BadRequestException, Injectable } from '@nestjs/common';
import { DailyStat, HomeroomStatus, InvoiceStatus, PaymentStatus, Prisma, StudentStatus } from '@prisma/client';
import { summarizeDay } from '../attendance/daily-summary';
import { localDate, zonedDayRange } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { schoolDaysEndingAt } from './alert-rules';

export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * JSON-friendly shape: BigInt and Decimal columns become numbers. A day without a single gate
 * event (a Sunday, a holiday, a device outage) has no attendance rate (`null`), so charts break
 * the line instead of dropping to zero.
 */
export function presentStat(s: DailyStat) {
  return {
    ...s,
    date: fromDbDate(s.date),
    attendanceRate: s.present > 0 ? Number(s.attendanceRate) : null,
    revenue: Number(s.revenue),
    overdueAmount: Number(s.overdueAmount),
  };
}
export type DailyStatView = ReturnType<typeof presentStat>;

/** Adds `days` days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

export type StatNumbers = Pick<
  DailyStatView,
  'students' | 'present' | 'late' | 'absent' | 'homeroomAbsent' | 'invoicesIssued' | 'invoicesPaid' | 'revenue' | 'overdueAmount' | 'healthIncidents' | 'lmsActiveStudents' | 'testsSubmitted'
>;

/**
 * Sums rows (several schools for one day, or several days) into one line. The attendance rate is
 * re-derived from the sums over the rows that have gate data, so days or schools without any
 * event neither drag the rate down nor count; with no such row it is `null`.
 */
export function aggregateStats(rows: StatNumbers[]) {
  const sum = (k: keyof StatNumbers, of: StatNumbers[] = rows) => of.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const reported = rows.filter((r) => Number(r.present) > 0);
  const students = sum('students');
  const present = sum('present');
  const base = sum('students', reported);
  return {
    schools: rows.length,
    students,
    present,
    late: sum('late'),
    absent: sum('absent'),
    attendanceRate: base ? Math.round((present / base) * 1000) / 10 : null,
    homeroomAbsent: sum('homeroomAbsent'),
    invoicesIssued: sum('invoicesIssued'),
    invoicesPaid: sum('invoicesPaid'),
    revenue: sum('revenue'),
    overdueAmount: sum('overdueAmount'),
    healthIncidents: sum('healthIncidents'),
    lmsActiveStudents: sum('lmsActiveStudents'),
    testsSubmitted: sum('testsSubmitted'),
  };
}

/**
 * Computes the per-school daily statistics row (Thống kê ngày) from the operational
 * tables. The scheduler refreshes today's row through the day and finalises yesterday's;
 * an admin can recompute a range after fixing data.
 */
@Injectable()
export class DailyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async computeDay(schoolId: string, date: string): Promise<DailyStat> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true, lateAfter: true } });
    const { start, end } = zonedDayRange(date, school.timezone);
    const window = { gte: start, lt: end };
    const day = toDbDate(date);

    const students = await this.prisma.student.findMany({ where: { schoolId, status: StudentStatus.STUDYING }, select: { id: true } });
    const studentIds = students.map((s) => s.id);
    const events = studentIds.length
      ? await this.prisma.gateEvent.findMany({
          where: { schoolId, studentId: { in: studentIds }, occurredAt: window },
          select: { studentId: true, occurredAt: true, direction: true },
        })
      : [];
    const byStudent = new Map<string, typeof events>();
    for (const e of events) byStudent.set(e.studentId!, [...(byStudent.get(e.studentId!) ?? []), e]);
    let present = 0;
    let late = 0;
    for (const list of byStudent.values()) {
      const s = summarizeDay(list, school.lateAfter, school.timezone);
      if (s.status === 'LATE') late++;
      if (s.status !== 'ABSENT') present++;
    }

    const [homeroomAbsent, invoicesIssued, invoicesPaid, payments, overdue, healthIncidents, lmsActive, testsSubmitted] = await Promise.all([
      this.prisma.homeroomAttendance.count({ where: { schoolId, date: day, status: { in: [HomeroomStatus.ABSENT, HomeroomStatus.EXCUSED] } } }),
      this.prisma.invoice.count({ where: { schoolId, issuedAt: window, status: { not: InvoiceStatus.CANCELLED } } }),
      this.prisma.invoice.count({ where: { schoolId, status: InvoiceStatus.PAID, payments: { some: { status: PaymentStatus.CONFIRMED, paidAt: window } } } }),
      this.prisma.payment.aggregate({ where: { schoolId, status: PaymentStatus.CONFIRMED, paidAt: window }, _sum: { amount: true } }),
      this.prisma.invoice.aggregate({
        where: { schoolId, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] }, dueDate: { lt: day } },
        _sum: { total: true, paidAmount: true },
      }),
      this.prisma.healthIncident.count({ where: { schoolId, occurredAt: window } }),
      this.prisma.lessonProgress.findMany({ where: { lastAt: window, lesson: { schoolId } }, distinct: ['studentId'], select: { studentId: true } }),
      this.prisma.testAttempt.count({ where: { submittedAt: window, test: { schoolId } } }),
    ]);

    // Without a single gate event nobody can be called absent: the day is a non-school day, a
    // holiday or a device outage, and the rate stays 0 with `presentStat` reporting it as null.
    const data = {
      students: studentIds.length,
      present,
      late,
      absent: present > 0 ? studentIds.length - present : 0,
      attendanceRate: new Prisma.Decimal(studentIds.length ? Math.round((present / studentIds.length) * 1000) / 10 : 0),
      homeroomAbsent,
      invoicesIssued,
      invoicesPaid,
      revenue: BigInt(payments._sum.amount ?? 0),
      overdueAmount: BigInt(Math.max(0, (overdue._sum.total ?? 0) - (overdue._sum.paidAmount ?? 0))),
      healthIncidents,
      lmsActiveStudents: lmsActive.length,
      testsSubmitted,
      computedAt: new Date(),
    };
    return this.prisma.dailyStat.upsert({ where: { schoolId_date: { schoolId, date: day } }, create: { schoolId, date: day, ...data }, update: data });
  }

  /** Recomputes every day from `from` to `to` inclusive (at most 62 days per call). */
  async computeRange(schoolId: string, from: string, to: string): Promise<DailyStat[]> {
    if (from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const out: DailyStat[] = [];
    for (let d = from, i = 0; d <= to; d = addDays(d, 1), i++) {
      if (i >= 62) throw new BadRequestException('Chỉ tính lại tối đa 62 ngày mỗi lần');
      out.push(await this.computeDay(schoolId, d));
    }
    return out;
  }

  /** Stored rows for one school, oldest first. */
  async range(schoolId: string, from: string, to: string): Promise<DailyStatView[]> {
    const rows = await this.prisma.dailyStat.findMany({ where: { schoolId, date: { gte: toDbDate(from), lte: toDbDate(to) } }, orderBy: { date: 'asc' } });
    return rows.map(presentStat);
  }

  /** Rows of several schools for one day. */
  async forDay(schoolIds: string[], date: string): Promise<DailyStatView[]> {
    const rows = await this.prisma.dailyStat.findMany({ where: { schoolId: { in: schoolIds }, date: toDbDate(date) } });
    return rows.map(presentStat);
  }

  /** Per-day aggregate across schools for the last `days` days ending at `to`, every day present (zeros when nothing was computed). */
  async trend(schoolIds: string[], to: string, days: number) {
    const from = addDays(to, -(days - 1));
    const rows = await this.prisma.dailyStat.findMany({ where: { schoolId: { in: schoolIds }, date: { gte: toDbDate(from), lte: toDbDate(to) } } });
    const byDate = new Map<string, DailyStatView[]>();
    for (const r of rows.map(presentStat)) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, ...aggregateStats(byDate.get(d) ?? []) });
    return out;
  }

  /** Today's date in the school's timezone. */
  async today(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return localDate(new Date(), school.timezone);
  }

  /**
   * Students (status STUDYING) with no gate event on any of the last `days` school days
   * ending at `date`: the input of ABSENT_STREAK rules.
   */
  async absentStreak(schoolId: string, date: string, days: number): Promise<{ id: string; code: string; fullName: string }[]> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    const dates = schoolDaysEndingAt(date, Math.max(1, Math.min(days, 30)));
    const students = await this.prisma.student.findMany({ where: { schoolId, status: StudentStatus.STUDYING }, select: { id: true, code: true, fullName: true } });
    if (!students.length) return [];
    let candidates = new Set(students.map((s) => s.id));
    for (const d of dates) {
      const { start, end } = zonedDayRange(d, school.timezone);
      const seen = await this.prisma.gateEvent.findMany({
        where: { schoolId, studentId: { in: [...candidates] }, occurredAt: { gte: start, lt: end } },
        distinct: ['studentId'],
        select: { studentId: true },
      });
      for (const e of seen) candidates.delete(e.studentId!);
      if (!candidates.size) return [];
    }
    // Students who also have no homeroom roll call marked PRESENT/LATE on those days (a gate-less school marks by hand).
    const rollCalled = await this.prisma.homeroomAttendance.findMany({
      where: { schoolId, studentId: { in: [...candidates] }, date: { in: dates.map(toDbDate) }, status: { in: [HomeroomStatus.PRESENT, HomeroomStatus.LATE] } },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    for (const r of rollCalled) candidates.delete(r.studentId);
    candidates = new Set([...candidates]);
    return students.filter((s) => candidates.has(s.id)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }
}

// Pure evaluation of alert rules against one day's statistics (no I/O; unit tested).
import { AlertKind } from '@prisma/client';

export interface DayStat {
  students: number;
  present: number;
  late: number;
  absent: number;
  /** Percentage with one decimal. */
  attendanceRate: number;
  overdueAmount: number | bigint;
  healthIncidents: number;
}

export interface RuleInput {
  kind: AlertKind;
  threshold: number;
}

/** Extra inputs that are not part of DailyStat: students absent on every one of the last `threshold` school days. */
export interface RuleContext {
  absentStreak?: { code: string; fullName: string }[];
}

export interface RuleResult {
  fired: boolean;
  /** The measured value the rule compared (percentage, VND, count). */
  value: number;
  message: string;
}

const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} ₫`;

/** Percentage of students who arrived after the late cut-off, one decimal. */
export function lateRate(stat: Pick<DayStat, 'students' | 'late'>): number {
  return stat.students ? Math.round((stat.late / stat.students) * 1000) / 10 : 0;
}

export function evaluateRule(rule: RuleInput, stat: DayStat, ctx: RuleContext = {}): RuleResult {
  const t = Number(rule.threshold);
  switch (rule.kind) {
    case AlertKind.ATTENDANCE_RATE_BELOW: {
      const value = Number(stat.attendanceRate);
      // No students or no gate data at all is a configuration gap, not an attendance problem.
      const fired = stat.students > 0 && stat.present > 0 && value < t;
      return { fired, value, message: `Tỷ lệ chuyên cần ${pct(value)} thấp hơn ngưỡng ${pct(t)} (${stat.present}/${stat.students} học sinh có mặt)` };
    }
    case AlertKind.LATE_RATE_ABOVE: {
      const value = lateRate(stat);
      return { fired: stat.students > 0 && value > t, value, message: `Tỷ lệ đi muộn ${pct(value)} vượt ngưỡng ${pct(t)} (${stat.late} học sinh)` };
    }
    case AlertKind.OVERDUE_FEES_ABOVE: {
      const value = Number(stat.overdueAmount);
      return { fired: value > t, value, message: `Công nợ quá hạn ${vnd(value)} vượt ngưỡng ${vnd(t)}` };
    }
    case AlertKind.HEALTH_INCIDENTS_ABOVE: {
      const value = stat.healthIncidents;
      return { fired: value > t, value, message: `${value} sự cố y tế trong ngày, vượt ngưỡng ${t}` };
    }
    case AlertKind.ABSENT_STREAK: {
      const list = ctx.absentStreak ?? [];
      const names = list.slice(0, 5).map((s) => `${s.fullName} (${s.code})`).join(', ');
      const more = list.length > 5 ? `… và ${list.length - 5} học sinh khác` : '';
      return { fired: list.length > 0, value: list.length, message: `${list.length} học sinh vắng ${t} ngày học liên tiếp: ${names}${more}` };
    }
    default:
      return { fired: false, value: 0, message: '' };
  }
}

/** Date strings (YYYY-MM-DD) of the last `n` school days (Monday–Saturday) ending at `date`, oldest first. */
export function schoolDaysEndingAt(date: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${date}T00:00:00Z`);
  while (out.length < n) {
    if (d.getUTCDay() !== 0) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

/** Sunday is not a school day; an ABSENT_STREAK rule is only evaluated on school days. */
export const isSchoolDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;

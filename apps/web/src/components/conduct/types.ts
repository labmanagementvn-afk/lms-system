// Shapes returned by the conduct API and small helpers shared by the portal, student and parent pages.

export interface Criterion {
  id: string;
  code: string;
  name: string;
  maxPoints: number;
  groupName: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount?: number;
}

export interface AssessmentItem {
  criterionId: string;
  selfPoints: number | null;
  teacherPoints: number | null;
  note: string | null;
  criterion: Criterion;
}

export interface AssessmentBrief {
  id: string;
  semester: number;
  month: number;
  status: 'DRAFT' | 'SELF_ASSESSED' | 'REVIEWED' | 'APPROVED';
  selfTotal: number | null;
  teacherTotal: number | null;
  finalTotal: number | null;
  level: 'TOT' | 'KHA' | 'DAT' | 'CHUA_DAT' | null;
  selfComment: string | null;
  teacherComment: string | null;
  reviewedById: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface Assessment extends AssessmentBrief {
  student: { id: string; code: string; fullName: string };
  class: { id: string; name: string; gradeLevel: number };
  items: AssessmentItem[];
}

export interface HistoryRow {
  id: string;
  semester: number;
  month: number;
  status: AssessmentBrief['status'];
  selfTotal: number | null;
  teacherTotal: number | null;
  finalTotal: number | null;
  level: AssessmentBrief['level'];
  approvedAt: string | null;
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
}

/** What the student and parent reads return. */
export interface OwnConduct {
  student: { id: string; code: string; fullName: string; class: { id: string; name: string } | null };
  academicYear: { id: string; name: string } | null;
  semester: number;
  month: number;
  criteria: Criterion[];
  assessment: Assessment | null;
  history?: HistoryRow[];
}

export const NO_GROUP = 'Tiêu chí khác';

/** Rows grouped by groupName in first-appearance order, each group's rows by sortOrder. */
export function groupBy<T>(rows: T[], groupOf: (r: T) => string | null, orderOf: (r: T) => number): { name: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => orderOf(a) - orderOf(b))) {
    const name = groupOf(r) || NO_GROUP;
    groups.set(name, [...(groups.get(name) ?? []), r]);
  }
  return [...groups.entries()].map(([name, rows]) => ({ name, rows }));
}

/** Σ min(points, max) over the given criteria; missing points count 0. */
export function totalOf(points: Record<string, number | null | undefined>, criteria: { id: string; maxPoints: number }[]): number {
  return criteria.reduce((sum, c) => sum + Math.min(points[c.id] ?? 0, c.maxPoints), 0);
}

/** "Học kỳ 1" or "Tháng 10 · HK1". */
export const roundLabel = (semester: number, month: number) => (month ? `Tháng ${month} · HK${semester}` : `Học kỳ ${semester}`);

/** The semester a date (YYYY-MM-DD) most likely falls in: 2 from mid January to July, else 1. */
export function semesterOf(date: string): 1 | 2 {
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return (m >= 2 && m <= 7) || (m === 1 && d >= 15) ? 2 : 1;
}

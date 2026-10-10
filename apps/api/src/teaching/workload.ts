// Định mức tiết dạy under Thông tư 05/2025/TT-BGDĐT (chế độ làm việc đối với giáo viên
// phổ thông): a teacher's weekly norm, what positions and duties set or take off, and the
// two limits of Điều 3 (at most two concurrent duties; at most half the norm over it).
// Pure functions: the services load the data, these do the arithmetic.
import { DutyKind } from '@prisma/client';
import { addDays, dayOfWeek, daysBetween, mondayOf } from '../homeroom/dates';

export type SchoolLevel = 'TH' | 'THCS' | 'THPT';

export const CIRCULAR = 'Thông tư 05/2025/TT-BGDĐT';
/** Điều 3: a teacher holds at most two of the duties of Điều 9, 10 and 11, a homeroom class included. */
export const MAX_CONCURRENT = 2;
/** Điều 3: periods taught over the norm in a week stay within half of the weekly norm. */
export const OVERTIME_RATIO = 0.5;
/** Weeks of actual teaching in a school year (35 plus 2 in reserve make the 37 of Điều 5). */
export const TEACHING_WEEKS = 35;

/** The level of a school from the grades it teaches; a school without classes yet counts as THCS. */
export function levelOf(gradeLevels: number[]): SchoolLevel {
  const top = Math.max(0, ...gradeLevels);
  if (top >= 10) return 'THPT';
  if (top >= 6 || top === 0) return 'THCS';
  return 'TH';
}

export const LEVEL_LABEL: Record<SchoolLevel, string> = { TH: 'Tiểu học', THCS: 'Trung học cơ sở', THPT: 'Trung học phổ thông' };

/** Điều 7: 23 periods a week in a primary school, 19 in a lower secondary school, 17 in an upper secondary school. */
export const TEACHER_NORM: Record<SchoolLevel, number> = { TH: 23, THCS: 19, THPT: 17 };
/** Điều 9: a homeroom teacher of a general school is relieved of 4 periods a week. */
export const HOMEROOM_REDUCTION = 4;

export interface DutyDefault {
  code: string;
  name: string;
  kind: DutyKind;
  periods: number;
  basis: string;
}

/** The circular's positions and duties, the catalogue a school starts from and then edits. */
export function defaultDuties(level: SchoolLevel): DutyDefault[] {
  const at = (article: number, note?: string) => `Điều ${article} ${CIRCULAR}${note ? `; ${note}` : ''}`;
  const { POSITION, CONCURRENT, OTHER } = DutyKind;
  return [
    { code: 'HT', name: 'Hiệu trưởng', kind: POSITION, periods: 2, basis: at(8) },
    { code: 'PHT', name: 'Phó hiệu trưởng', kind: POSITION, periods: 4, basis: at(8) },
    ...(level === 'THPT'
      ? []
      : [{ code: 'TPTD', name: 'Tổng phụ trách Đội', kind: POSITION, periods: level === 'TH' ? 8 : 6, basis: at(7, '2 tiết ở trường từ 28 lớp (vùng 1: từ 19 lớp)') }]),
    { code: 'TTCM', name: 'Tổ trưởng chuyên môn', kind: CONCURRENT, periods: 3, basis: at(9) },
    { code: 'TPCM', name: 'Tổ phó chuyên môn', kind: CONCURRENT, periods: 1, basis: at(9) },
    { code: 'PHBM', name: 'Phụ trách phòng học bộ môn', kind: CONCURRENT, periods: 3, basis: at(9, 'mỗi môn, trừ phòng tin học, khi trường không có viên chức thiết bị, thí nghiệm') },
    { code: 'PTB', name: 'Phụ trách phòng thiết bị giáo dục', kind: CONCURRENT, periods: 3, basis: at(9, 'khi trường không có viên chức thiết bị, thí nghiệm') },
    { code: 'BTCB', name: 'Bí thư chi bộ', kind: CONCURRENT, periods: 3, basis: at(10, '4 tiết ở trường đủ quy mô lớp theo vùng') },
    { code: 'CTHD', name: 'Chủ tịch hội đồng trường', kind: CONCURRENT, periods: 2, basis: at(10) },
    { code: 'TKHD', name: 'Thư ký hội đồng trường', kind: CONCURRENT, periods: 2, basis: at(10) },
    { code: 'TBTT', name: 'Trưởng ban thanh tra nhân dân', kind: CONCURRENT, periods: 2, basis: at(10) },
    { code: 'CNTT', name: 'Kiêm nhiệm công nghệ thông tin', kind: CONCURRENT, periods: 3, basis: at(11, 'gồm phụ trách phòng tin học') },
    { code: 'VT', name: 'Kiêm nhiệm văn thư', kind: CONCURRENT, periods: 3, basis: at(11) },
    { code: 'TV', name: 'Kiêm nhiệm thư viện', kind: CONCURRENT, periods: 3, basis: at(11, 'gồm phụ trách phòng thư viện') },
    { code: 'TS', name: 'Giáo viên tập sự', kind: OTHER, periods: 2, basis: at(12) },
    { code: 'NCN', name: 'Giáo viên nữ nuôi con dưới 12 tháng', kind: OTHER, periods: level === 'TH' ? 4 : 3, basis: at(12) },
  ];
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
/** "1,5" with the Vietnamese decimal comma. */
export const periodsText = (n: number) => String(round1(n)).replace('.', ',');

/** Average periods a week from the periods of a year, to the nearest half period (52 a year -> 1,5). */
export const weeklyFromYearly = (periodsPerYear: number) => Math.round((periodsPerYear / TEACHING_WEEKS) * 2) / 2;

export interface DutyLine {
  name: string;
  kind: DutyKind;
  periods: number;
}

export interface WorkloadInput {
  /** The school's norm for a teacher. */
  teacherNorm: number;
  homeroomReduction: number;
  /** Names of the classes the teacher is homeroom teacher of. */
  homeroomClasses: string[];
  /** Positions and duties held in the semester. */
  duties: DutyLine[];
  /** Periods a week assigned to teach. */
  assigned: number;
}

export interface Workload {
  /** The position with a norm of its own, if any. */
  position: string | null;
  norm: number;
  reductions: { label: string; periods: number }[];
  reduced: number;
  /** Periods a week the teacher must teach: the norm less the reductions, never below 0. */
  required: number;
  assigned: number;
  /** Assigned less required: over (+) or short (-). */
  difference: number;
  /** Concurrent duties held, homeroom classes included. */
  concurrent: number;
  warnings: string[];
}

/** A teacher's norm and load for one semester, with the circular's limits checked. */
export function workload(input: WorkloadInput): Workload {
  const positions = input.duties.filter((d) => d.kind === DutyKind.POSITION);
  // Holding two positions with norms of their own is unusual; the lower norm applies.
  const position = positions.length ? positions.reduce((a, b) => (b.periods < a.periods ? b : a)) : null;
  const norm = position ? position.periods : input.teacherNorm;
  const reductions = [
    ...input.homeroomClasses.map((c) => ({ label: `Chủ nhiệm lớp ${c}`, periods: input.homeroomReduction })),
    ...input.duties.filter((d) => d.kind !== DutyKind.POSITION).map((d) => ({ label: d.name, periods: d.periods })),
  ];
  const reduced = round1(reductions.reduce((a, r) => a + r.periods, 0));
  const required = Math.max(0, round1(norm - reduced));
  const assigned = round1(input.assigned);
  const difference = round1(assigned - required);
  const concurrent = input.homeroomClasses.length + input.duties.filter((d) => d.kind === DutyKind.CONCURRENT).length;
  const warnings: string[] = [];
  if (concurrent > MAX_CONCURRENT) warnings.push(`Kiêm nhiệm ${concurrent} nhiệm vụ, quá 02 nhiệm vụ cho phép (Điều 3 ${CIRCULAR})`);
  if (difference > round1(norm * OVERTIME_RATIO)) warnings.push(`Dạy vượt ${periodsText(difference)} tiết/tuần, quá 50% định mức ${periodsText(norm)} tiết (Điều 3 ${CIRCULAR})`);
  if (positions.length > 1) warnings.push(`Giữ ${positions.length} chức vụ có định mức riêng; tính theo định mức thấp nhất`);
  return { position: position?.name ?? null, norm, reductions, reduced, required, assigned, difference, concurrent, warnings };
}

/**
 * Tuần học of a date: week 1 is the week the school year opens in, or the next one when it
 * opens on a Saturday or Sunday. Days before week 1 give 0 or less.
 */
export function schoolWeek(date: string, yearStart: string): number {
  let first = mondayOf(yearStart);
  if (dayOfWeek(yearStart) >= 6) first = addDays(first, 7);
  return Math.floor(daysBetween(first, mondayOf(date)) / 7) + 1;
}

// Shapes of the /teaching API (phân công chuyên môn, kiêm nhiệm, định mức, lịch báo giảng) and helpers its pages share.

export interface TeacherRef {
  id: string;
  code: string;
  fullName: string;
}

export interface ClassRef {
  id: string;
  name: string;
  gradeLevel: number;
}

export interface SubjectRef {
  id: string;
  code: string;
  name: string;
}

export interface Assignment {
  id: string;
  semester: number;
  class: ClassRef;
  subject: SubjectRef;
  teacher: TeacherRef;
  periodsPerWeek: number;
}

export interface AssignmentList {
  academicYear: { id: string; name: string };
  semester: number;
  items: Assignment[];
  /** Periods a week each teacher has in the timetable, per class and subject. */
  timetable: { classId: string; subjectId: string; teacherId: string; periods: number }[];
  /** Periods a week from each subject's periods a year (35 weeks). */
  suggested: Record<string, number>;
}

export interface DutyType {
  id: string;
  code: string;
  name: string;
  kind: 'POSITION' | 'CONCURRENT' | 'OTHER';
  periods: number;
  basis: string | null;
  active: boolean;
  sortOrder: number;
  used: number;
}

export interface TeacherDuty {
  id: string;
  teacher: TeacherRef & { subjectGroup: string | null };
  dutyType: Pick<DutyType, 'id' | 'code' | 'name' | 'kind' | 'periods'>;
  semester: number | null;
  periods: number | null;
  effectivePeriods: number;
  note: string | null;
}

export interface WorkloadRow {
  teacher: TeacherRef & { subjectGroup: string | null; active: boolean };
  homeroomClasses: string[];
  duties: TeacherDuty[];
  teaching: { subject: string; classes: string[]; periods: number }[];
  position: string | null;
  norm: number;
  reductions: { label: string; periods: number }[];
  reduced: number;
  required: number;
  assigned: number;
  difference: number;
  concurrent: number;
  warnings: string[];
}

export interface WorkloadSetting {
  level: 'TH' | 'THCS' | 'THPT';
  levelName: string;
  teacherNorm: number;
  homeroomReduction: number;
  defaults: { teacherNorm: number; homeroomReduction: number };
  custom: boolean;
}

export interface Workload {
  academicYear: { id: string; name: string };
  semester: number;
  setting: WorkloadSetting;
  rows: WorkloadRow[];
  totals: { teachers: number; assigned: number; required: number; over: number; short: number; warnings: number };
}

export interface CalendarSlot {
  periodNumber: number;
  class: { id: string; name: string };
  subject: SubjectRef;
  room: string | null;
  scheduled: boolean;
  plan: { id: string; lessonNo: number | null; title: string; aids: string | null; note: string | null } | null;
  session: 'MORNING' | 'AFTERNOON' | null;
  startTime: string | null;
  endTime: string | null;
}

export interface CalendarWeek {
  teacher: TeacherRef;
  academicYear: { id: string; name: string };
  week: { number: number | null; from: string; to: string };
  editable: boolean;
  planned: number;
  periods: number;
  days: { date: string; dayOfWeek: number; semester: number; slots: CalendarSlot[] }[];
}

/** The usual order of THCS subjects, as the reports print them; others follow by name. */
const SUBJECT_ORDER = ['TOAN', 'VAN', 'ANH', 'KHTN', 'LY', 'HOA', 'SINH', 'LSDL', 'SU', 'DIA', 'GDCD', 'TIN', 'CN', 'GDTC', 'NT', 'AN', 'MT', 'HDTN', 'GDDP'];

export function orderSubjects<T extends { code: string; name: string }>(subjects: T[]): T[] {
  const rank = (code: string) => {
    const i = SUBJECT_ORDER.indexOf(code.toUpperCase());
    return i === -1 ? SUBJECT_ORDER.length : i;
  };
  return [...subjects].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, 'vi'));
}

export const byClassName = (a: { gradeLevel: number; name: string }, b: { gradeLevel: number; name: string }) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true });

/**
 * InputNumber props for periods a week, in half periods: "4" and "1,5" with the decimal comma
 * rather than the "4.0" a step of 0.5 shows, and "1,5" or "1.5" typed either way.
 */
export const periodInput = {
  step: 0.5,
  decimalSeparator: ',',
  formatter: (v?: string | number) => (v === undefined || v === '' ? '' : String(v).replace('.', ',')),
};

/** "+4", "-1,5", "0": over or short of the norm. */
export const signed = (n: number) => {
  const s = String(Math.round(Math.abs(n) * 10) / 10).replace('.', ',');
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : '0';
};

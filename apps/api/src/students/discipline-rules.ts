// Khen thưởng và kỷ luật học sinh under Thông tư 19/2025/TT-BGDĐT (in force from
// 31/10/2025): which commendation forms and discipline measures exist, who may give
// them, and when a measure may be taken. Pure functions, so the rules are unit tested.
import { AwardForm, DisciplineMeasure, Role } from '@prisma/client';

/** Grades 1 to 5 are primary (tiểu học): a reminder or an apology only. */
export const PRIMARY_MAX_GRADE = 5;

export const AWARD_LABEL: Record<AwardForm, string> = {
  CLASS_PRAISE: 'Tuyên dương trước lớp',
  SCHOOL_PRAISE: 'Tuyên dương trước toàn trường',
  PRINCIPAL_CERTIFICATE: 'Giấy khen của Hiệu trưởng',
  LETTER: 'Thư khen',
  OTHER: 'Hình thức khen thưởng khác',
};

export const MEASURE_LABEL: Record<DisciplineMeasure, string> = {
  REMINDER: 'Nhắc nhở',
  CRITICISM: 'Phê bình',
  SELF_REVIEW: 'Yêu cầu viết bản tự kiểm điểm',
  APOLOGY: 'Yêu cầu xin lỗi',
};

export const SEVERITY_LABEL: Record<number, string> = {
  1: 'Mức độ 1: có tác hại đến bản thân học sinh',
  2: 'Mức độ 2: ảnh hưởng tiêu cực trong nhóm, lớp',
  3: 'Mức độ 3: ảnh hưởng tiêu cực trong nhà trường',
};

/** The measures of Điều 13 for a student of this grade. */
export function measuresFor(gradeLevel: number): DisciplineMeasure[] {
  return gradeLevel <= PRIMARY_MAX_GRADE ? [DisciplineMeasure.REMINDER, DisciplineMeasure.APOLOGY] : [DisciplineMeasure.REMINDER, DisciplineMeasure.CRITICISM, DisciplineMeasure.SELF_REVIEW];
}

/**
 * Why the measure cannot be taken for this violation (Điều 14, 15), or null when it can.
 * `earlier` are the student's measures of the school year. A lighter measure than the
 * circular's is always allowed; a heavier one needs the violation or history it names.
 */
export function measureProblem(measure: DisciplineMeasure, severity: number, gradeLevel: number, earlier: DisciplineMeasure[]): string | null {
  if (!measuresFor(gradeLevel).includes(measure)) {
    return gradeLevel <= PRIMARY_MAX_GRADE ? 'Học sinh tiểu học chỉ áp dụng biện pháp nhắc nhở hoặc yêu cầu xin lỗi (Điều 13)' : 'Yêu cầu xin lỗi chỉ áp dụng cho học sinh tiểu học (Điều 13)';
  }
  switch (measure) {
    case DisciplineMeasure.REMINDER:
      return null;
    case DisciplineMeasure.APOLOGY:
      return severity >= 2 || earlier.includes(DisciplineMeasure.REMINDER) ? null : 'Yêu cầu xin lỗi áp dụng khi học sinh đã bị nhắc nhở mà tiếp tục vi phạm mức độ 1, hoặc vi phạm từ mức độ 2 (Điều 14)';
    case DisciplineMeasure.CRITICISM:
      return severity >= 2 || earlier.includes(DisciplineMeasure.REMINDER) ? null : 'Phê bình áp dụng khi học sinh đã bị nhắc nhở mà tiếp tục vi phạm mức độ 1, hoặc vi phạm mức độ 2 (Điều 15)';
    case DisciplineMeasure.SELF_REVIEW:
      return severity >= 3 || (severity === 2 && earlier.includes(DisciplineMeasure.CRITICISM))
        ? null
        : 'Yêu cầu viết bản tự kiểm điểm áp dụng khi học sinh đã bị phê bình mà tiếp tục vi phạm mức độ 2, hoặc vi phạm mức độ 3 (Điều 15)';
  }
}

/**
 * Điều 17: the principal and the homeroom teacher take every measure; other managers,
 * teachers and staff only the primary measures and a reminder.
 */
export function mayTakeMeasure(measure: DisciplineMeasure, role: Role, isHomeroomTeacher: boolean): boolean {
  if (role === Role.ADMIN || isHomeroomTeacher) return true;
  if (role !== Role.STAFF && role !== Role.TEACHER) return false;
  return measure === DisciplineMeasure.REMINDER || measure === DisciplineMeasure.APOLOGY;
}

/**
 * Điều 6 to 10: a teacher praises before the class and may send a letter; the school
 * praises before everyone, gives the principal's certificate and records other awards,
 * which the office enters for the principal.
 */
export function mayGiveAward(form: AwardForm, role: Role): boolean {
  if (role === Role.ADMIN || role === Role.STAFF) return true;
  return role === Role.TEACHER && (form === AwardForm.CLASS_PRAISE || form === AwardForm.LETTER);
}

// Pure rules for who an announcement reaches. The audience is stored as JSON on the
// announcement: { roles: Role[], classIds: string[], gradeLevels: number[] }.
import { Prisma, Role } from '@prisma/client';

export interface Audience {
  roles: Role[];
  classIds: string[];
  gradeLevels: number[];
}

const ROLES = new Set<string>(Object.values(Role));

/** Normalises the stored (or posted) audience, dropping anything malformed and de-duplicating. */
export function parseAudience(raw: unknown): Audience {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    roles: [...new Set(list(o.roles).filter((r): r is Role => typeof r === 'string' && ROLES.has(r)))],
    classIds: [...new Set(list(o.classIds).filter((c): c is string => typeof c === 'string' && c.length > 0))],
    gradeLevels: [...new Set(list(o.gradeLevels).filter((g): g is number => Number.isInteger(g)))],
  };
}

export const isEmptyAudience = (a: Audience) => !a.roles.length && !a.classIds.length && !a.gradeLevels.length;

/** Teachers may only address the classes they are homeroom teacher of. Returns the error, or null when allowed. */
export function teacherAudienceError(a: Audience, homeroomClassIds: string[]): string | null {
  if (a.roles.length || a.gradeLevels.length) return 'Giáo viên chỉ được gửi thông báo tới lớp mình chủ nhiệm';
  if (!a.classIds.length) return 'Chọn lớp nhận thông báo';
  if (a.classIds.some((id) => !homeroomClassIds.includes(id))) return 'Bạn không phải giáo viên chủ nhiệm lớp này';
  return null;
}

/**
 * Prisma filter for the users an audience reaches: active users of the school whose role is
 * listed, plus the parents and the students themselves of the listed classes or of the current
 * year's classes of the listed grades, plus those classes' homeroom teachers. Null for an empty audience.
 */
export function recipientWhere(schoolId: string, academicYearId: string, a: Audience): Prisma.UserWhereInput | null {
  const or: Prisma.UserWhereInput[] = [];
  if (a.roles.length) or.push({ role: { in: a.roles } });
  const classes: Prisma.ClassWhereInput[] = [];
  if (a.classIds.length) classes.push({ id: { in: a.classIds } });
  if (a.gradeLevels.length) classes.push({ gradeLevel: { in: a.gradeLevels }, academicYearId });
  if (classes.length) {
    const klass: Prisma.ClassWhereInput = { schoolId, OR: classes };
    or.push({ role: Role.PARENT, guardians: { some: { student: { enrollments: { some: { class: klass } } } } } });
    or.push({ role: Role.STUDENT, student: { enrollments: { some: { class: klass } } } });
    or.push({ role: Role.TEACHER, teacher: { homeroomClasses: { some: klass } } });
  }
  return or.length ? { schoolId, isActive: true, OR: or } : null;
}

/** Distinct users and how many of each role, e.g. { PARENT: 120, TEACHER: 4 }. */
export function summarizeRecipients<T extends { id: string; role: Role }>(users: T[]): { users: T[]; byRole: Partial<Record<Role, number>> } {
  const unique = [...new Map(users.map((u) => [u.id, u])).values()];
  const byRole: Partial<Record<Role, number>> = {};
  for (const u of unique) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  return { users: unique, byRole };
}

// Code generators for applications (TS26-00001) and students (HS2026001).
import { Prisma } from '@prisma/client';

/** `TS<yy>-` prefix of application codes submitted in `year`. */
export const applicationPrefix = (year: number) => `TS${String(year).slice(-2)}-`;

export const applicationCode = (year: number, n: number) => `${applicationPrefix(year)}${String(n).padStart(5, '0')}`;

/** `HS<year>` prefix of student codes of the intake `year`. */
export const studentPrefix = (year: number) => `HS${year}`;

/**
 * Next student code of an intake year: the largest numeric suffix among the
 * school's existing `HS<year>NNN` codes plus one, at least three digits wide.
 */
export function nextStudentCode(year: number, existingCodes: string[], offset = 0): string {
  const prefix = studentPrefix(year);
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d{3,}$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}${String(max + 1 + offset).padStart(3, '0')}`;
}

/** True for a unique-constraint error on a constraint that includes `field`. */
export function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
}

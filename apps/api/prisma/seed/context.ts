import { PrismaClient } from '@prisma/client';

/** What the core seed created, handed to each module's seeder. */
export interface SeedContext {
  schoolId: string;
  academicYearId: string;
  /** Class name -> id (6A1, 6A2, 7A1). */
  classes: Record<string, string>;
  /** Teacher code -> teacher id (GV001 ... GV008). */
  teachers: Record<string, string>;
  /** Teacher code -> user id. */
  teacherUsers: Record<string, string>;
  /** Subject code -> id (TOAN, VAN, ANH, ...). */
  subjects: Record<string, string>;
  /** Student ids in creation order: 10 per class, 6A1 first, then 6A2, then 7A1. */
  studentIds: string[];
  adminUserId: string;
  staffUserId: string;
  /** bcrypt hash for a demo password. */
  hash: (password: string) => Promise<string>;
}

export type Seeder = (prisma: PrismaClient, ctx: SeedContext) => Promise<void>;

/**
 * The context of a demo school seeded earlier, so seeders added later can top it
 * up. Null when the demo year or accounts are gone (testers can change the demo).
 */
export async function loadContext(prisma: PrismaClient, schoolId: string, hash: SeedContext['hash']): Promise<SeedContext | null> {
  const year = await prisma.academicYear.findFirst({ where: { schoolId, name: '2026-2027' }, select: { id: true } });
  const [admin, staff] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'admin@demo.edu.vn' }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: 'baove@demo.edu.vn' }, select: { id: true } }),
  ]);
  if (!year || !admin || !staff) return null;
  const [classes, teachers, subjects, students] = await Promise.all([
    prisma.class.findMany({ where: { schoolId, academicYearId: year.id }, select: { id: true, name: true } }),
    prisma.teacher.findMany({ where: { schoolId }, select: { id: true, code: true, userId: true } }),
    prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true } }),
    // The 30 core students were created class by class with increasing codes.
    prisma.student.findMany({
      where: { schoolId, code: { startsWith: 'HS2026' }, enrollments: { some: { academicYearId: year.id, class: { name: { in: ['6A1', '6A2', '7A1'] } } } } },
      select: { id: true },
      orderBy: { code: 'asc' },
      take: 30,
    }),
  ]);
  if (students.length < 30) return null;
  return {
    schoolId,
    academicYearId: year.id,
    classes: Object.fromEntries(classes.map((c) => [c.name, c.id])),
    teachers: Object.fromEntries(teachers.map((t) => [t.code, t.id])),
    teacherUsers: Object.fromEntries(teachers.filter((t) => t.userId).map((t) => [t.code, t.userId as string])),
    subjects: Object.fromEntries(subjects.map((s) => [s.code, s.id])),
    studentIds: students.map((s) => s.id),
    adminUserId: admin.id,
    staffUserId: staff.id,
    hash,
  };
}

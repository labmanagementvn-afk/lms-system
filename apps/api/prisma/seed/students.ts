import { PrismaClient, Role } from '@prisma/client';
import { SeedContext } from './context';

export const STUDENT_PASSWORD = 'Student@123';

/** One login per student: username = student code in lower case. */
export async function seedStudentAccounts(prisma: PrismaClient, ctx: SeedContext) {
  const students = await prisma.student.findMany({ where: { schoolId: ctx.schoolId, userId: null }, select: { id: true, code: true, fullName: true }, orderBy: { code: 'asc' } });
  const passwordHash = await ctx.hash(STUDENT_PASSWORD);
  for (const s of students) {
    const user = await prisma.user.create({
      data: { schoolId: ctx.schoolId, username: s.code.toLowerCase(), fullName: s.fullName, role: Role.STUDENT, passwordHash, mustChangePassword: false },
    });
    await prisma.student.update({ where: { id: s.id }, data: { userId: user.id } });
  }
  console.log(`  Student app: ${students[0]?.code.toLowerCase()} / ${STUDENT_PASSWORD} (every student code uses the same password)`);
}

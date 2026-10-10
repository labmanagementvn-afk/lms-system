import { ERecordStatus, Prisma, PrismaClient, Role, SignatureProvider } from '@prisma/client';
import { AcademicYearsService } from '../../src/academic-years/academic-years';
import { AuthUser } from '../../src/common/auth-user';
import { contentHash } from '../../src/esign/canonical';
import { ERecordsService, SignatureEntry } from '../../src/esign/erecords.service';
import { MockSignatureAdapter } from '../../src/esign/signature-provider';
import { SignaturesService } from '../../src/esign/signatures.service';
import { GradeControlService } from '../../src/grades/control.service';
import { GradesService } from '../../src/grades/grades.service';
import { YEAR } from '../../src/grades/tt22';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ReportsService } from '../../src/reports/reports.service';
import { SeedContext } from './context';

// Phase 8 (Học bạ số): the principal's own account, sandbox signing accounts for the
// principal and the 9A1 homeroom teacher, and 9A1's học bạ at the end of the year
// (phase 7): six issued (one of them reissued after a correction), two waiting for the
// principal, two waiting for the homeroom teacher, and two not made yet because the
// students' summer review is still open. Signed through the services with the sandbox
// providers, then dated back to the end of May and June 2027.

export const PRINCIPAL_EMAIL = 'hieutruong@demo.edu.vn';

const VN = (local: string) => new Date(`${local}+07:00`);

/** False when the demo was changed too much for the records to be made. */
export async function seedERecords(prisma: PrismaClient, ctx: SeedContext): Promise<boolean> {
  const { schoolId, academicYearId } = ctx;
  const db = prisma as unknown as PrismaService;
  const klass = await prisma.class.findFirst({ where: { schoolId, academicYearId, name: '9A1' }, select: { id: true, homeroomTeacher: { select: { user: { select: { id: true, email: true } } } } } });
  const homeroomUser = klass?.homeroomTeacher?.user;
  if (!klass || !homeroomUser) {
    console.log('Demo school: class 9A1 or its homeroom teacher is missing; học bạ số not added.');
    return false;
  }
  // 9A1's students in the order phase 7 created them (codes HS2023001, HS2023002, ...).
  const students = (await prisma.enrollment.findMany({ where: { classId: klass.id }, select: { student: { select: { id: true, code: true } } } })).map((e) => e.student).sort((a, b) => a.code.localeCompare(b.code));
  if (students.length < 12) {
    console.log('Demo school: class 9A1 was changed; học bạ số not added.');
    return false;
  }

  // The principal signs with her own account rather than the shared admin one.
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { principalName: true } });
  const principal =
    (await prisma.user.findUnique({ where: { email: PRINCIPAL_EMAIL }, select: { id: true, schoolId: true } })) ??
    (await prisma.user.create({ data: { schoolId, email: PRINCIPAL_EMAIL, fullName: school.principalName ?? 'Nguyễn Thị Hồng Hạnh', role: Role.ADMIN, passwordHash: await ctx.hash('Admin@123') }, select: { id: true, schoolId: true } }));
  if (principal.schoolId !== schoolId) {
    console.log(`Demo school: ${PRINCIPAL_EMAIL} belongs to another school; học bạ số not added.`);
    return false;
  }
  const asPrincipal: AuthUser = { userId: principal.id, schoolId, districtId: null, role: Role.ADMIN, email: PRINCIPAL_EMAIL };
  const asHomeroom: AuthUser = { userId: homeroomUser.id, schoolId, districtId: null, role: Role.TEACHER, email: homeroomUser.email ?? '' };
  const asOffice: AuthUser = { userId: ctx.adminUserId, schoolId, districtId: null, role: Role.ADMIN, email: 'admin@demo.edu.vn' };

  // Always the sandbox providers, whatever ESIGN_PROVIDERS says.
  const adapters = new Map(Object.values(SignatureProvider).map((p) => [p, new MockSignatureAdapter(p)] as const));
  const signatures = new SignaturesService(db, adapters);
  const years = new AcademicYearsService(db);
  const control = new GradeControlService(db, years);
  const reports = new ReportsService(db, years, new GradesService(db, new NotificationsService(db), years, control), control);
  const records = new ERecordsService(db, reports, signatures);

  for (const [user, provider, account] of [
    [asPrincipal, SignatureProvider.VNPT_SMARTCA, '0911111000'],
    [asHomeroom, SignatureProvider.VIETTEL_MYSIGN, '0911111004'],
  ] as const) {
    if (!(await prisma.signatureProfile.findUnique({ where: { userId: user.userId }, select: { userId: true } }))) await signatures.save(user, { provider, account });
  }

  /** Makes the records of these students as on `at`: the letterhead dated that day and the hash taken again. */
  async function generate(indexes: number[], at: Date) {
    const ids = indexes.map((i) => students[i].id);
    await records.generate(asOffice, { classId: klass!.id, studentIds: ids });
    const made = await prisma.eRecord.findMany({ where: { classId: klass!.id, studentId: { in: ids }, status: ERecordStatus.DRAFT } });
    for (const r of made) {
      const content = r.content as unknown as { letterhead: { date: string } };
      content.letterhead.date = at.toISOString();
      await prisma.eRecord.update({ where: { id: r.id }, data: { content: content as unknown as Prisma.InputJsonValue, contentHash: contentHash(content), createdAt: at } });
    }
    return new Map(made.map((r) => [students.findIndex((s) => s.id === r.studentId), r.id]));
  }

  /** Signs at the records' next step, a few seconds apart from `at` on. */
  async function sign(user: AuthUser, ids: string[], at: Date) {
    const result = await records.sign(user, ids);
    if (result.failed.length) throw new Error(`học bạ số not signed: ${result.failed.map((f) => f.error).join('; ')}`);
    for (const [k, id] of ids.entries()) {
      const r = await prisma.eRecord.findUniqueOrThrow({ where: { id }, select: { status: true, signatures: true } });
      const entries = r.signatures as unknown as SignatureEntry[];
      const signedAt = new Date(at.getTime() + k * 6_000);
      entries[entries.length - 1].signedAt = signedAt.toISOString();
      await prisma.eRecord.update({ where: { id }, data: { signatures: entries as unknown as Prisma.InputJsonValue, issuedAt: r.status === ERecordStatus.ISSUED ? signedAt : undefined } });
    }
  }

  // Made after the gradebook was locked on 26/05; the homeroom teacher signs the next day, the principal the day after.
  const first = await generate([0, 1, 2, 3, 4, 5, 6, 7, 11], VN('2027-05-27T08:00:00'));
  const pick = (map: Map<number, string>, indexes: number[]) => indexes.flatMap((i) => (map.has(i) ? [map.get(i)!] : []));
  await sign(asHomeroom, pick(first, [0, 1, 2, 3, 4, 5, 6, 7]), VN('2027-05-28T15:30:00'));
  await sign(asPrincipal, pick(first, [0, 1, 2, 3, 4, 5]), VN('2027-05-29T09:15:00'));

  // Trần Bảo Ngọc's was issued without the homeroom teacher's comment: withdrawn, completed and signed again.
  const withdrawn = first.get(1);
  if (withdrawn) {
    await records.revoke(asPrincipal, withdrawn, 'Bổ sung nhận xét của giáo viên chủ nhiệm');
    await prisma.eRecord.update({ where: { id: withdrawn }, data: { revokedAt: VN('2027-06-03T09:00:00') } });
    await prisma.termResult.updateMany({
      where: { studentId: students[1].id, academicYearId, semester: YEAR, homeroomComment: null },
      data: { homeroomComment: 'Chăm ngoan, học tốt, tích cực tham gia các hoạt động của lớp' },
    });
    const second = await generate([1], VN('2027-06-04T08:00:00'));
    await sign(asHomeroom, pick(second, [1]), VN('2027-06-04T10:00:00'));
    await sign(asPrincipal, pick(second, [1]), VN('2027-06-05T08:30:00'));
  }

  // Đỗ Hải Đăng's waited for his retakes (marked on 20/06); Thảo's and Toàn's still wait for the summer review.
  await generate([8], VN('2027-06-22T08:00:00'));
  return true;
}

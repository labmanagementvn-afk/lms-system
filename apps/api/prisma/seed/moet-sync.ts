import { MoetExportKind, MoetTarget, PrismaClient, Role } from '@prisma/client';
import { AuthUser } from '../../src/common/auth-user';
import { MockMoetGateway } from '../../src/moet/moet-gateway';
import { MoetSyncService } from '../../src/moet/moet-sync.service';
import { MoetService } from '../../src/moet/moet.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UploadsService } from '../../src/uploads/uploads.service';
import { SeedContext } from './context';

// Phase 8 (Đồng bộ CSDL ngành): the start of the year's submissions to the Sở's database
// and the ministry's: classes and students accepted, a sign-in refused for a wrong password,
// and the teachers refused because their profiles lack a date of birth. Sent through the
// sandbox gateway (which takes any password of 6 characters or more), then dated back.

const PASSWORD = 'demo-password';

export async function seedMoetSync(prisma: PrismaClient, ctx: SeedContext) {
  const db = prisma as unknown as PrismaService;
  // Always the sandbox, whatever MOET_SYNC_PROVIDER says: demo records must never reach the real database.
  const sync = new MoetSyncService(db, new MoetService(db, new UploadsService(db)), new MockMoetGateway());
  const admin: AuthUser = { userId: ctx.adminUserId, schoolId: ctx.schoolId, districtId: null, role: Role.ADMIN, email: 'admin@demo.edu.vn' };
  const school = await prisma.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { moetCode: true } });
  const account = { MOET: school.moetCode ?? '01-0123-456', PROVINCE: 'thcsdemo.caugiay' };
  const runs: [MoetTarget, MoetExportKind, string, string][] = [
    [MoetTarget.PROVINCE, MoetExportKind.CLASSES, PASSWORD, '2026-09-14T08:30:00+07:00'],
    [MoetTarget.PROVINCE, MoetExportKind.STUDENTS, PASSWORD, '2026-09-14T08:34:00+07:00'],
    [MoetTarget.MOET, MoetExportKind.STUDENTS, 'sai', '2026-09-16T15:02:00+07:00'],
    [MoetTarget.MOET, MoetExportKind.STUDENTS, PASSWORD, '2026-09-16T15:05:00+07:00'],
    [MoetTarget.MOET, MoetExportKind.TEACHERS, PASSWORD, '2026-09-16T15:09:00+07:00'],
  ];
  for (const [target, kind, password, when] of runs) {
    const s = await sync.sync(admin, { target, kind, username: account[target], password });
    const startedAt = new Date(when);
    await prisma.moetSync.update({
      where: { id: s.id },
      // The batch number carries the day it was sent.
      data: { startedAt, finishedAt: new Date(startedAt.getTime() + 4_000), externalRef: s.externalRef?.replace(/-\d{8}-/, `-${when.slice(0, 10).replace(/-/g, '')}-`) ?? null },
    });
  }
}

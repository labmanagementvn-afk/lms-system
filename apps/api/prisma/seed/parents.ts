import { NotificationChannel, NotificationKind, PrismaClient, Role } from '@prisma/client';
import { normalizePhone } from '../../src/common/phone';
import { SeedContext } from './context';

export const PARENT_PASSWORD = 'Parent@123';

/**
 * One parent login per guardian phone number. The first parent gets two
 * children so the child switcher in the app has something to switch.
 */
export async function seedParents(prisma: PrismaClient, ctx: SeedContext) {
  const [first, second] = ctx.studentIds;
  const firstGuardian = await prisma.guardian.findFirstOrThrow({ where: { studentId: first } });
  await prisma.guardian.updateMany({ where: { studentId: second }, data: { phone: firstGuardian.phone, fullName: firstGuardian.fullName } });

  const guardians = await prisma.guardian.findMany({ where: { student: { schoolId: ctx.schoolId }, userId: null } });
  const passwordHash = await ctx.hash(PARENT_PASSWORD);
  const byPhone = new Map<string, typeof guardians>();
  for (const g of guardians) {
    const phone = normalizePhone(g.phone);
    if (!phone) continue;
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), g]);
  }
  let firstParentId: string | null = null;
  for (const [phone, list] of byPhone) {
    const user = await prisma.user.create({
      data: { schoolId: ctx.schoolId, phone, fullName: list[0].fullName, role: Role.PARENT, passwordHash, mustChangePassword: false },
    });
    await prisma.guardian.updateMany({ where: { id: { in: list.map((g) => g.id) } }, data: { userId: user.id } });
    firstParentId ??= user.id;
  }

  await prisma.notificationSettings.create({
    data: { schoolId: ctx.schoolId, channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH, NotificationChannel.ZALO] },
  });
  if (firstParentId) {
    await prisma.notification.create({
      data: {
        schoolId: ctx.schoolId,
        userId: firstParentId,
        kind: NotificationKind.SYSTEM,
        title: 'Chào mừng đến với ứng dụng phụ huynh',
        body: 'Tại đây phụ huynh theo dõi điểm danh, học phí, bán trú, xe đưa đón và thông báo của nhà trường.',
      },
    });
  }

  console.log(`  Parent app: ${firstGuardian.phone.replace(/\D/g, '')} / ${PARENT_PASSWORD} (2 children); every other guardian phone uses the same password`);
}

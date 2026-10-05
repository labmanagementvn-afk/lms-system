import { AnnouncementStatus, NotificationChannel, NotificationKind, Prisma, PrismaClient, Role, RsvpResponse } from '@prisma/client';
import { localDate, zonedToUtc } from '../../src/common/time';
import { addDays, dayOfWeek } from '../../src/homeroom/dates';
import { SeedContext } from './context';

// Demo announcements: one sent to every parent, one parent-meeting event with RSVP for 6A1,
// one draft and one scheduled for tomorrow morning.

type AudienceJson = { roles: Role[]; classIds: string[]; gradeLevels: number[] };
const audience = (a: Partial<AudienceJson>): Prisma.InputJsonValue => ({ roles: [], classIds: [], gradeLevels: [], ...a });

export async function seedAnnouncements(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const tz = school.timezone;
  const today = localDate(new Date(), tz);
  const createdById = ctx.adminUserId;

  /** A SENT announcement with one notification per recipient; `recipients` is exactly what was created. */
  async function sendTo(data: Omit<Prisma.AnnouncementUncheckedCreateInput, 'schoolId' | 'status' | 'recipients' | 'createdById'>, userIds: string[], sentAt: Date) {
    const a = await prisma.announcement.create({ data: { schoolId, ...data, sentAt, status: AnnouncementStatus.SENT, recipients: userIds.length, createdById } });
    if (userIds.length) {
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          schoolId,
          userId,
          kind: a.kind,
          title: a.title,
          body: a.body,
          announcementId: a.id,
          data: { eventAt: a.eventAt?.toISOString() ?? null, location: a.location, rsvp: a.rsvp },
          createdAt: sentAt,
        })),
      });
    }
    return a;
  }

  // 1. To every parent account (none exist until parent accounts are created; the count stays truthful).
  const parents = await prisma.user.findMany({ where: { schoolId, role: Role.PARENT, isActive: true }, select: { id: true } });
  await sendTo(
    {
      kind: NotificationKind.ANNOUNCEMENT,
      title: 'Lịch học tuần tới và lưu ý đầu năm',
      body: 'Kính gửi quý phụ huynh, từ tuần tới nhà trường học theo thời khóa biểu chính thức (sáng từ 7h30). Học sinh mặc đồng phục đầy đủ và mang thẻ học sinh khi qua cổng. Trân trọng.',
      audience: audience({ roles: [Role.PARENT] }),
      channels: [NotificationChannel.IN_APP],
    },
    parents.map((p) => p.id),
    zonedToUtc(`${addDays(today, -2)} 17:00`, tz),
  );

  // 2. Parent meeting for 6A1 next Saturday 08:00, with RSVP, to the class's parents and homeroom teacher.
  const classId = ctx.classes['6A1'];
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const recipients = await prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      OR: [
        { role: Role.PARENT, guardians: { some: { student: { enrollments: { some: { classId } } } } } },
        { role: Role.TEACHER, teacher: { homeroomClasses: { some: { id: classId } } } },
      ],
    },
    select: { id: true, role: true },
  });
  const meeting = await sendTo(
    {
      kind: NotificationKind.EVENT,
      title: 'Họp phụ huynh đầu năm',
      body: 'Kính mời quý phụ huynh lớp 6A1 dự họp phụ huynh đầu năm học. Nội dung: kế hoạch năm học, các khoản thu và phối hợp giáo dục. Vui lòng xác nhận tham dự.',
      eventAt: zonedToUtc(`${saturday} 08:00`, tz),
      location: 'Phòng P.101',
      rsvp: true,
      audience: audience({ classIds: [classId] }),
      channels: [NotificationChannel.IN_APP],
    },
    recipients.map((r) => r.id),
    zonedToUtc(`${addDays(today, -1)} 08:00`, tz),
  );
  const answers = [RsvpResponse.GOING, RsvpResponse.GOING, RsvpResponse.MAYBE];
  const responders = recipients.filter((r) => r.role === Role.PARENT).slice(0, answers.length);
  if (responders.length) {
    await prisma.announcementResponse.createMany({
      data: responders.map((p, i) => ({ announcementId: meeting.id, userId: p.id, response: answers[i] })),
      skipDuplicates: true,
    });
  }

  // 3. A draft still being written.
  await prisma.announcement.create({
    data: {
      schoolId,
      kind: NotificationKind.EVENT,
      title: 'Dã ngoại học kỳ I: Khu di tích Cổ Loa',
      body: 'Dự kiến tổ chức cho khối 6 và 7. Chi tiết chi phí và lịch trình sẽ gửi sau khi chốt.',
      eventAt: zonedToUtc(`${addDays(today, 21)} 07:00`, tz),
      location: 'Khu di tích Cổ Loa, Đông Anh',
      rsvp: true,
      audience: audience({ gradeLevels: [6, 7] }),
      channels: [NotificationChannel.IN_APP],
      status: AnnouncementStatus.DRAFT,
      createdById,
    },
  });

  // 4. Scheduled for tomorrow 07:00; the scheduler sends it.
  await prisma.announcement.create({
    data: {
      schoolId,
      kind: NotificationKind.ANNOUNCEMENT,
      title: 'Nhắc lịch kiểm tra giữa học kỳ I',
      body: 'Kiểm tra giữa kỳ diễn ra từ tuần sau theo lịch của từng khối. Phụ huynh nhắc các con ôn tập và mang đủ dụng cụ học tập.',
      audience: audience({ roles: [Role.PARENT, Role.TEACHER] }),
      channels: [NotificationChannel.IN_APP],
      scheduledAt: zonedToUtc(`${addDays(today, 1)} 07:00`, tz),
      status: AnnouncementStatus.SCHEDULED,
      createdById,
    },
  });
}

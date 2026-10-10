import { NotificationChannel, PrismaClient, Role, SmsAudience, SyncStatus } from '@prisma/client';
import { AcademicYearsService } from '../../src/academic-years/academic-years';
import { AuthUser } from '../../src/common/auth-user';
import { localDate, zonedToUtc } from '../../src/common/time';
import { addDays, mondayOf } from '../../src/homeroom/dates';
import { MockChannelAdapter } from '../../src/notifications/channels/mock-channel.adapter';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SmsDispatcher } from '../../src/sms/sms-dispatcher.service';
import { SmsCampaignDto } from '../../src/sms/sms.dto';
import { SmsService } from '../../src/sms/sms.service';
import { SeedContext } from './context';

// Phase 8 (Liên lạc): the school's SMS brandname and quotas, reusable templates, and a
// history: the start-of-year parent meeting, a fee reminder with one text that failed, a
// staff meeting call, the 9A1 homeroom teacher's own text, a storm closure called off
// before it went out, and a parent meeting scheduled for next week. The texts go through
// the SMS service and the sandbox gateway, then are dated back.

const { PARENT, TEACHER } = SmsAudience;

const TEMPLATES: [string, SmsAudience, string][] = [
  ['Họp phụ huynh', PARENT, '{truong} kính mời phụ huynh em {hoc_sinh} lớp {lop} dự họp phụ huynh lúc 7h30 Chủ nhật tuần này tại phòng học của lớp. Trân trọng!'],
  ['Học sinh vắng mặt', PARENT, '{truong} thông báo: em {hoc_sinh} lớp {lop} vắng mặt buổi học ngày {ngay} không có lý do. Đề nghị phụ huynh liên hệ giáo viên chủ nhiệm.'],
  ['Nhắc học phí', PARENT, '{truong} nhắc phụ huynh em {hoc_sinh} lớp {lop}: hạn nộp học phí tháng này là ngày 15. Phụ huynh đã nộp xin bỏ qua tin nhắn này. Trân trọng!'],
  ['Kết quả học tập', PARENT, '{truong} thông báo: kết quả học tập của em {hoc_sinh} ({ma_hs}) lớp {lop} đã có trên ứng dụng. Phụ huynh đăng nhập để xem chi tiết.'],
  ['Nghỉ học đột xuất', PARENT, '{truong} thông báo: do thời tiết xấu, học sinh nghỉ học ngày mai. Phụ huynh em {hoc_sinh} lớp {lop} theo dõi thông báo tiếp theo của nhà trường.'],
  ['Họp Hội đồng sư phạm', TEACHER, 'Kính gửi thầy/cô {giao_vien}: {truong} họp Hội đồng sư phạm lúc 14h00 chiều mai tại phòng họp tầng 2. Đề nghị thầy/cô có mặt đúng giờ. Trân trọng!'],
  ['Nhắc nhập điểm', TEACHER, 'Kính gửi thầy/cô {giao_vien}: hạn nhập điểm học kỳ trên hệ thống là hết thứ Sáu tuần này. Trân trọng cảm ơn!'],
];

const bodyOf = (name: string) => TEMPLATES.find((t) => t[0] === name)![2];

/** "13/09" of a calendar date. */
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export async function seedSms(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, adminUserId, teacherUsers } = ctx;
  const db = prisma as unknown as PrismaService;
  const { timezone: tz } = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
  const today = localDate(new Date(), tz);
  const at = (days: number, time: string) => zonedToUtc(`${addDays(today, days)} ${time}`, tz);

  await prisma.smsSetting.upsert({ where: { schoolId }, create: { schoolId, brandname: 'THCS DEMO' }, update: {} });
  await prisma.smsTemplate.createMany({ data: TEMPLATES.map(([name, audience, body]) => ({ schoolId, name, audience, body })) });
  const classes = Object.fromEntries(
    (await prisma.class.findMany({ where: { schoolId, academicYearId, name: { in: ['6A1', '6A2', '7A1', '9A1'] } }, select: { id: true, name: true } })).map((c) => [c.name, c.id]),
  );
  // The graduating class texts its parents more, about the entrance exam to grade 10.
  if (classes['9A1']) await prisma.smsClassQuota.create({ data: { classId: classes['9A1'], schoolId, monthlyLimit: 300 } });

  // Always the sandbox gateway, whatever NOTIFY_PROVIDERS says: demo texts must never reach a phone.
  const dispatcher = new SmsDispatcher(db, new Map([[NotificationChannel.SMS, new MockChannelAdapter(NotificationChannel.SMS)]]));
  const sms = new SmsService(db, new AcademicYearsService(db), dispatcher);
  const admin: AuthUser = { userId: adminUserId, schoolId, districtId: null, role: Role.ADMIN, email: 'admin@demo.edu.vn' };
  const ids = (...names: string[]) => names.filter((n) => classes[n]).map((n) => classes[n]);

  /** Sends now, then dates the text back as if it had gone out at `sentAt`. */
  async function sendAt(by: AuthUser, dto: SmsCampaignDto, sentAt: Date) {
    const c = await sms.send(by, dto);
    await prisma.smsCampaign.update({ where: { id: c.id }, data: { createdAt: new Date(sentAt.getTime() - 15 * 60_000), scheduledAt: sentAt, finishedAt: new Date(sentAt.getTime() + 60_000) } });
    await prisma.smsMessage.updateMany({ where: { campaignId: c.id }, data: { nextAttemptAt: sentAt } });
    await prisma.smsMessage.updateMany({ where: { campaignId: c.id, status: SyncStatus.SUCCESS }, data: { sentAt: new Date(sentAt.getTime() + 20_000) } });
    return c;
  }

  await sendAt(
    admin,
    {
      audience: PARENT,
      classIds: ids('6A1', '6A2', '7A1', '9A1'),
      title: 'Họp phụ huynh đầu năm học',
      body: '{truong} kính mời phụ huynh em {hoc_sinh} lớp {lop} dự họp phụ huynh đầu năm học lúc 7h30 Chủ nhật 13/09/2026 tại phòng học của lớp. Trân trọng!',
    },
    new Date('2026-09-08T07:30:00+07:00'),
  );

  // Called off: the storm turned away the evening before.
  const storm = await sms.send(admin, { audience: PARENT, classIds: ids('6A1', '6A2', '7A1', '9A1'), title: 'Nghỉ học do bão', body: bodyOf('Nghỉ học đột xuất'), scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
  await sms.cancel(admin, storm.id);
  await prisma.smsCampaign.update({ where: { id: storm.id }, data: { createdAt: at(-4, '20:05'), scheduledAt: at(-3, '05:30'), cancelledAt: at(-4, '21:40') } });

  await sendAt(admin, { audience: TEACHER, allTeachers: true, title: 'Họp Hội đồng sư phạm', body: bodyOf('Họp Hội đồng sư phạm') }, at(-3, '16:30'));

  // One father's phone was off for the whole retry window.
  const fees = await sendAt(admin, { audience: PARENT, classIds: ids('6A1', '6A2'), title: 'Nhắc học phí', body: bodyOf('Nhắc học phí') }, at(-2, '09:00'));
  const unreachable = await prisma.smsMessage.findFirst({ where: { campaignId: fees.id }, orderBy: { seq: 'desc' }, select: { id: true } });
  if (unreachable) {
    await prisma.smsMessage.update({ where: { id: unreachable.id }, data: { status: SyncStatus.FAILED, attempts: 5, sentAt: null, externalRef: null, lastError: 'Thuê bao tạm thời không liên lạc được' } });
  }

  if (classes['9A1'] && teacherUsers.GV004) {
    const homeroom: AuthUser = { userId: teacherUsers.GV004, schoolId, districtId: null, role: Role.TEACHER, email: 'gv004@demo.edu.vn' };
    await sendAt(
      homeroom,
      {
        audience: PARENT,
        classIds: ids('9A1'),
        title: 'Lịch ôn thi vào lớp 10',
        body: 'GVCN lớp {lop} thông báo: từ tuần sau lớp ôn thi vào lớp 10 chiều thứ Ba và thứ Năm, 14h00-16h30. Đề nghị phụ huynh nhắc em {hoc_sinh} đi học đầy đủ.',
      },
      at(-1, '19:45'),
    );
  }

  // Next week's parent meeting of 7A1, texted three days ahead.
  const meeting = addDays(mondayOf(addDays(today, 7)), 6);
  await sms.send(admin, {
    audience: PARENT,
    classIds: ids('7A1'),
    title: 'Họp phụ huynh giữa học kỳ',
    body: `{truong} kính mời phụ huynh em {hoc_sinh} lớp {lop} dự họp phụ huynh giữa học kỳ lúc 7h30 Chủ nhật ${dm(meeting)} tại phòng học của lớp. Trân trọng!`,
    scheduledAt: zonedToUtc(`${addDays(meeting, -3)} 07:00`, tz).toISOString(),
  });
}

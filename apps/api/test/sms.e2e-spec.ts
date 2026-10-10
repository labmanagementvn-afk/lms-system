import { INestApplication } from '@nestjs/common';
import { GuardianRelationship, NotificationChannel } from '@prisma/client';
import request from 'supertest';
import { CHANNEL_ADAPTERS } from '../src/notifications/channels/channel-adapter';
import { MockChannelAdapter } from '../src/notifications/channels/mock-channel.adapter';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// Tin nhắn SMS: templates, sending now or later through the SMS adapter, retries, and the per-class quota.
describe('SMS to parents and teachers (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let classId: string; // 6A, homeroom = the TEACHER user
  let otherClassId: string; // 6B, homeroom = a teacher without an account
  let studentIds: string[];
  let sms: MockChannelAdapter;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  const TZ = 'Asia/Ho_Chi_Minh';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const month = today.slice(0, 7);
  const monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`;
  const BODY = 'Kính gửi phụ huynh em {hoc_sinh} lớp {lop}: mời dự họp lúc 8 giờ ngày {ngay}.';
  const usageOf = async (id: string) => (await api().get('/api/v1/sms/usage').set(admin()).expect(200)).body.classes.find((c: any) => c.classId === id);

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `SM${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    const yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-sm${run}@test.vn`.toLowerCase() } });
    const gv1 = await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', phone: '0912 000 001', userId: teacherUser.id } });
    const gv2 = await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng', phone: '+84 912 000 002' } });
    await prisma.teacher.create({ data: { schoolId, code: 'GV3', fullName: 'Lê Thu Hà' } }); // no phone
    await prisma.teacher.create({ data: { schoolId, code: 'GV4', fullName: 'Đỗ Văn Nghỉ', phone: '0912000004', status: 'RESIGNED' } });
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6A', gradeLevel: 6, homeroomTeacherId: gv1.id } })).id;
    otherClassId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6B', gradeLevel: 6, homeroomTeacherId: gv2.id } })).id;
    studentIds = [];
    // An has a mother (primary) and a father; Bình only a father, not primary; Châu no phone at all.
    const guardians: Record<string, { fullName: string; phone: string; isPrimary: boolean; relationship: GuardianRelationship }[]> = {
      'Nguyễn Văn An': [
        { fullName: 'Nguyễn Văn Cha', phone: '0987000001', isPrimary: false, relationship: GuardianRelationship.FATHER },
        { fullName: 'Phạm Thị Mẹ', phone: '0987 000 002', isPrimary: true, relationship: GuardianRelationship.MOTHER },
      ],
      'Trần Thị Bình': [{ fullName: 'Trần Văn Bố', phone: '0987000003', isPrimary: false, relationship: GuardianRelationship.FATHER }],
      'Lê Minh Châu': [{ fullName: 'Lê Thị Mai', phone: 'chưa có', isPrimary: true, relationship: GuardianRelationship.MOTHER }],
    };
    for (const [i, name] of Object.keys(guardians).entries()) {
      const s = await prisma.student.create({
        data: { schoolId, code: `HS${i + 1}`, fullName: name, enrollments: { create: { classId, academicYearId: yearId } }, guardians: { create: guardians[name] } },
      });
      studentIds.push(s.id);
    }
    await prisma.student.create({
      data: { schoolId, code: 'HS9', fullName: 'Phạm Quốc Dũng', enrollments: { create: { classId: otherClassId, academicYearId: yearId } }, guardians: { create: { fullName: 'Phạm Văn Ba', phone: '0987000009', isPrimary: true, relationship: GuardianRelationship.FATHER } } },
    });
    sms = app.get<Map<NotificationChannel, MockChannelAdapter>>(CHANNEL_ADAPTERS).get(NotificationChannel.SMS)!;
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts from the default settings, which only the principal changes', async () => {
    const s = await api().get('/api/v1/sms/settings').set(teacher()).expect(200);
    expect(s.body).toMatchObject({ brandname: null, classMonthlyQuota: 200, schoolMonthlyQuota: 500, provider: 'mock-sms', maxSegments: 4 });
    expect(Object.keys(s.body.placeholders.PARENT)).toEqual(['hoc_sinh', 'ma_hs', 'lop', 'phu_huynh', 'truong', 'ngay']);
    await api().put('/api/v1/sms/settings').set(staff()).send({ classMonthlyQuota: 10 }).expect(403);
    await api().put('/api/v1/sms/settings').set(admin()).send({ brandname: 'THCS Đông' }).expect(400);
    const saved = await api().put('/api/v1/sms/settings').set(admin()).send({ brandname: 'THCS TEST', classMonthlyQuota: 10, schoolMonthlyQuota: 3 }).expect(200);
    expect(saved.body).toMatchObject({ brandname: 'THCS TEST', classMonthlyQuota: 10, schoolMonthlyQuota: 3 });
  });

  it('keeps templates whose placeholders fit their audience', async () => {
    const bad = await api().post('/api/v1/sms/templates').set(staff()).send({ name: 'Sai', audience: 'PARENT', body: 'Kính gửi thầy cô {giao_vien} về em {hoc_sinh}' }).expect(400);
    expect(bad.body.message).toBe('Không có trường {giao_vien} cho tin nhắn gửi phụ huynh');
    await api().post('/api/v1/sms/templates').set(teacher()).send({ name: 'Họp', audience: 'PARENT', body: BODY }).expect(403);
    const t = await api().post('/api/v1/sms/templates').set(staff()).send({ name: 'Mời họp phụ huynh', audience: 'PARENT', body: BODY }).expect(201);
    await api().post('/api/v1/sms/templates').set(staff()).send({ name: 'Họp hội đồng', audience: 'TEACHER', body: 'Kính mời thầy cô {giao_vien} họp hội đồng lúc 14h ngày {ngay}.' }).expect(201);
    const parentOnly = await api().get('/api/v1/sms/templates').query({ audience: 'PARENT' }).set(teacher()).expect(200);
    expect(parentOnly.body.map((x: any) => x.name)).toEqual(['Mời họp phụ huynh']);
    await api().patch(`/api/v1/sms/templates/${t.body.id}`).set(staff()).send({ audience: 'TEACHER' }).expect(400);
    await api().patch(`/api/v1/sms/templates/${t.body.id}`).set(staff()).send({ name: 'Mời họp PHHS' }).expect(200);
  });

  it('previews who gets the text and what it costs', async () => {
    const p = await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', classIds: [classId], body: BODY }).expect(200);
    expect(p.body).toMatchObject({ recipients: 2, segments: 2, longest: 1, tooLong: 0, label: 'Phụ huynh lớp 6A', month, overQuota: false });
    expect(p.body.skipped).toEqual([{ name: 'Lê Minh Châu', className: '6A', reason: 'Chưa có số điện thoại phụ huynh' }]);
    // The primary guardian first; plain text loses the diacritics.
    expect(p.body.samples[0]).toEqual({
      name: 'Phạm Thị Mẹ',
      phone: '0987000002',
      studentName: 'Nguyễn Văn An',
      className: '6A',
      text: `Kinh gui phu huynh em Nguyen Van An lop 6A: moi du hop luc 8 gio ngay ${today.split('-').reverse().join('/')}.`,
      segments: 1,
    });
    expect(p.body.samples[1]).toMatchObject({ name: 'Trần Văn Bố', phone: '0987000003', studentName: 'Trần Thị Bình' });
    expect(p.body.quota).toEqual([{ classId, name: 'Lớp 6A', limit: 10, used: 0, needed: 2, remaining: 10, over: false }]);
    const accented = await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', studentIds: [studentIds[0]], body: BODY, accented: true }).expect(200);
    expect(accented.body.samples[0].text).toContain('Kính gửi phụ huynh em Nguyễn Văn An');
    expect(accented.body.label).toBe('Phụ huynh 1 học sinh');
    expect(accented.body.segments).toBe(2);
  });

  it('lets a teacher text only the parents of their own homeroom class', async () => {
    const other = await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', classIds: [otherClassId], body: BODY }).expect(403);
    expect(other.body.message).toBe('Bạn không phải giáo viên chủ nhiệm lớp này');
    const dung = await prisma.student.findFirstOrThrow({ where: { schoolId, code: 'HS9' } });
    await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', studentIds: [dung.id], body: BODY }).expect(403);
    await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'TEACHER', allTeachers: true, body: 'Họp' }).expect(403);
    await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', body: BODY }).expect(400);
    await api().post('/api/v1/sms/preview').set(admin()).send({ audience: 'PARENT', studentIds: ['nope'], body: BODY }).expect(400);
  });

  it('sends now through the SMS gateway under the brandname and counts it against the class', async () => {
    const before = sms.sent.length;
    const c = await api().post('/api/v1/sms/campaigns').set(teacher()).send({ audience: 'PARENT', classIds: [classId], title: 'Họp phụ huynh', body: BODY }).expect(201);
    expect(c.body).toMatchObject({ status: 'SENT', recipients: 2, segments: 2, label: 'Phụ huynh lớp 6A', createdBy: 'TEACHER', counts: { PENDING: 0, SUCCESS: 2, FAILED: 0 } });
    expect(sms.sent.slice(before).map((m) => [m.to, m.title])).toEqual([
      [['0987000002'], 'THCS TEST'],
      [['0987000003'], 'THCS TEST'],
    ]);
    const messages = await api().get(`/api/v1/sms/campaigns/${c.body.id}/messages`).set(teacher()).expect(200);
    expect(messages.body.items.map((m: any) => [m.seq, m.student.fullName, m.className, m.status])).toEqual([
      [1, 'Nguyễn Văn An', '6A', 'SUCCESS'],
      [2, 'Trần Thị Bình', '6A', 'SUCCESS'],
    ]);
    expect((await usageOf(classId)).used).toBe(2);
    // The teacher sees their own texts; the office sees everyone's.
    expect((await api().get('/api/v1/sms/campaigns').set(teacher()).expect(200)).body.total).toBe(1);
    expect((await api().get('/api/v1/sms/campaigns').set(staff()).expect(200)).body.total).toBe(1);
  });

  it('refuses a text the class quota cannot pay for', async () => {
    await api().put(`/api/v1/sms/quotas/${classId}`).set(staff()).send({ monthlyLimit: 3 }).expect(403);
    await api().put(`/api/v1/sms/quotas/${classId}`).set(admin()).send({ monthlyLimit: 3 }).expect(200);
    expect(await usageOf(classId)).toMatchObject({ limit: 3, custom: true, used: 2, remaining: 1 });
    const p = await api().post('/api/v1/sms/preview').set(teacher()).send({ audience: 'PARENT', classIds: [classId], body: BODY }).expect(200);
    expect(p.body.overQuota).toBe(true);
    const res = await api().post('/api/v1/sms/campaigns').set(teacher()).send({ audience: 'PARENT', classIds: [classId], title: 'Lần 2', body: BODY }).expect(400);
    expect(res.body.message).toBe(`Vượt hạn mức tin nhắn tháng ${monthLabel}: Lớp 6A còn 1 SMS, cần 2 SMS`);
    await api().put(`/api/v1/sms/quotas/${classId}`).set(admin()).send({ monthlyLimit: null }).expect(200);
    expect(await usageOf(classId)).toMatchObject({ limit: 10, custom: false, remaining: 8 });
  });

  it('schedules a text, holds it until its time, and cancels it', async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const c = await api().post('/api/v1/sms/campaigns').set(staff()).send({ audience: 'PARENT', studentIds: [studentIds[1]], title: 'Nhắc học phí', body: 'Em {hoc_sinh} còn nợ học phí tháng 10.', scheduledAt: at }).expect(201);
    expect(c.body).toMatchObject({ status: 'SCHEDULED', counts: { PENDING: 1, SUCCESS: 0, FAILED: 0 } });
    await api().post('/api/v1/sms/dispatch').set(staff()).expect(200);
    expect((await api().get(`/api/v1/sms/campaigns/${c.body.id}`).set(staff()).expect(200)).body.status).toBe('SCHEDULED');
    // A scheduled text holds its share of the quota (when it falls in this month).
    if (new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(at)).startsWith(month)) expect((await usageOf(classId)).used).toBe(3);
    await api().post(`/api/v1/sms/campaigns/${c.body.id}/cancel`).set(teacher()).expect(404);
    const cancelled = await api().post(`/api/v1/sms/campaigns/${c.body.id}/cancel`).set(staff()).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', counts: { PENDING: 0, SUCCESS: 0, FAILED: 0 } });
    expect((await usageOf(classId)).used).toBe(2);
    await api().post(`/api/v1/sms/campaigns/${c.body.id}/cancel`).set(staff()).expect(400);
    await api().post('/api/v1/sms/campaigns').set(staff()).send({ audience: 'PARENT', classIds: [classId], title: 'Quá khứ', body: BODY, scheduledAt: '2026-01-01T00:00:00Z' }).expect(400);
  });

  it('retries failed texts with backoff, gives up after five attempts, and sends them again on request', async () => {
    const c = await api().post('/api/v1/sms/campaigns').set(staff()).send({ audience: 'PARENT', studentIds: [studentIds[0]], title: 'Lỗi', body: 'Thử [mock-fail] em {hoc_sinh}' }).expect(201);
    expect(c.body).toMatchObject({ status: 'SENDING', counts: { PENDING: 1, SUCCESS: 0, FAILED: 0 } });
    for (let i = 0; i < 4; i++) {
      await prisma.smsMessage.updateMany({ where: { campaignId: c.body.id }, data: { nextAttemptAt: new Date() } });
      await api().post('/api/v1/sms/dispatch').set(staff()).expect(200);
    }
    const failed = await api().get(`/api/v1/sms/campaigns/${c.body.id}`).set(staff()).expect(200);
    expect(failed.body).toMatchObject({ status: 'SENT', counts: { PENDING: 0, SUCCESS: 0, FAILED: 1 } });
    const [m] = (await api().get(`/api/v1/sms/campaigns/${c.body.id}/messages`).query({ status: 'FAILED' }).set(staff()).expect(200)).body.items;
    expect(m).toMatchObject({ attempts: 5, lastError: 'mock-sms: simulated failure' });
    // Failed texts are not billed.
    expect((await usageOf(classId)).used).toBe(2);
    await prisma.smsMessage.updateMany({ where: { campaignId: c.body.id }, data: { body: 'Thu lai em Nguyen Van An' } });
    const retried = await api().post(`/api/v1/sms/campaigns/${c.body.id}/retry`).set(staff()).expect(200);
    expect(retried.body).toMatchObject({ status: 'SENT', counts: { PENDING: 0, SUCCESS: 1, FAILED: 0 } });
    await api().post(`/api/v1/sms/campaigns/${c.body.id}/retry`).set(staff()).expect(400);
    expect((await usageOf(classId)).used).toBe(3);
  });

  it('texts teachers from the school pool, office only', async () => {
    const p = await api().post('/api/v1/sms/preview').set(staff()).send({ audience: 'TEACHER', allTeachers: true, body: 'Kính mời thầy cô {giao_vien} họp hội đồng.' }).expect(200);
    expect(p.body).toMatchObject({ recipients: 2, label: 'Toàn bộ giáo viên' });
    expect(p.body.skipped).toEqual([{ name: 'Lê Thu Hà', reason: 'Chưa có số điện thoại' }]);
    expect(p.body.samples.map((s: any) => [s.name, s.phone, s.text])).toEqual([
      ['Nguyễn Thị Lan', '0912000001', 'Kinh moi thay co Nguyen Thi Lan hop hoi dong.'],
      ['Trần Văn Hùng', '0912000002', 'Kinh moi thay co Tran Van Hung hop hoi dong.'],
    ]);
    expect(p.body.quota).toEqual([{ classId: null, name: 'Quỹ tin chung của trường', limit: 3, used: 0, needed: 2, remaining: 3, over: false }]);
    await api().post('/api/v1/sms/campaigns').set(staff()).send({ audience: 'TEACHER', allTeachers: true, title: 'Họp hội đồng', body: 'Kính mời thầy cô {giao_vien} họp hội đồng.' }).expect(201);
    const usage = await api().get('/api/v1/sms/usage').set(staff()).expect(200);
    expect(usage.body.school).toEqual({ limit: 3, used: 2, remaining: 1 });
    expect(usage.body.used).toBe(5);
    const mine = await api().get('/api/v1/sms/usage').set(teacher()).expect(200);
    expect(mine.body.school).toBeNull();
    expect(mine.body.classes.map((c: any) => c.name)).toEqual(['6A']);
  });

  it('refuses texts longer than four SMS', async () => {
    const res = await api().post('/api/v1/sms/campaigns').set(staff()).send({ audience: 'PARENT', classIds: [classId], title: 'Dài', body: 'a'.repeat(700) }).expect(400);
    expect(res.body.message).toBe('Tin nhắn dài quá 4 SMS (tin gửi Phạm Thị Mẹ cần 5 SMS), hãy rút gọn nội dung');
  });

  it('prints the SMS statistics for the office', async () => {
    const r = await api().get('/api/v1/reports/sms-usage').query({ from: today, to: today }).set(staff()).expect(200);
    const [table] = r.body.document.blocks;
    expect(table.rows).toEqual([
      [1, 'Lớp 6A', 'Nguyễn Thị Lan', 3, 3, 0, 0, 3],
      [2, 'Tin nhắn gửi giáo viên', '', 2, 2, 0, 0, 2],
      ['', 'Tổng cộng', '', 5, 5, 0, 0, 5],
    ]);
    await api().get('/api/v1/reports/sms-usage').query({ from: today, to: today }).set(teacher()).expect(403);
  });
});

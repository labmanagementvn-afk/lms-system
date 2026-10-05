import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { zonedToUtc } from '../src/common/time';
import { bearer, createApp, createParent, createSchool, prisma, runId } from './helpers';

// Homeroom roll call, lesson logbook and announcements against a real Postgres.
describe('Homeroom & announcements (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let yearId: string;
  let classId: string; // 6A, homeroom = the TEACHER user
  let otherClassId: string; // 6B, homeroom = a teacher without an account
  let teacherId: string;
  let teacher2Id: string;
  let subjectId: string;
  let studentIds: string[];
  let otherStudentId: string;
  let parent: Awaited<ReturnType<typeof createParent>>;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  const TZ = 'Asia/Ho_Chi_Minh';
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + offsetDays * 86_400_000));
  const dmy = (ymd: string) => ymd.split('-').reverse().join('/');
  const today = vnDate(0);
  const yesterday = vnDate(-1);
  // A fixed Tuesday in semester 1 of the test academic year (2026-2027).
  const LESSON_DAY = '2026-10-06';

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `HA${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `HB${run}`)).tokens;

    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-ha${run}@test.vn`.toLowerCase() } });
    teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUser.id } })).id;
    teacher2Id = (await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng' } })).id;
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6A', gradeLevel: 6, homeroomTeacherId: teacherId } })).id;
    otherClassId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6B', gradeLevel: 6, homeroomTeacherId: teacher2Id } })).id;
    studentIds = [];
    for (const [i, name] of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu'].entries()) {
      const s = await prisma.student.create({
        data: { schoolId, code: `HS${i + 1}`, fullName: name, enrollments: { create: { classId, academicYearId: yearId } } },
      });
      studentIds.push(s.id);
    }
    otherStudentId = (
      await prisma.student.create({ data: { schoolId, code: 'HS9', fullName: 'Phạm Quốc Dũng', enrollments: { create: { classId: otherClassId, academicYearId: yearId } } } })
    ).id;
    parent = await createParent(app, schoolId, [studentIds[0]]);
    subjectId = (await prisma.subject.create({ data: { schoolId, code: 'TOAN', name: 'Toán' } })).id;
    // Tuesday timetable: 6A period 1 by the homeroom teacher, period 2 by teacher 2; 6B period 1 by teacher 2.
    await prisma.timetableEntry.createMany({
      data: [
        { schoolId, academicYearId: yearId, semester: 1, classId, subjectId, teacherId, dayOfWeek: 2, periodNumber: 1 },
        { schoolId, academicYearId: yearId, semester: 1, classId, subjectId, teacherId: teacher2Id, dayOfWeek: 2, periodNumber: 2 },
        { schoolId, academicYearId: yearId, semester: 1, classId: otherClassId, subjectId, teacherId: teacher2Id, dayOfWeek: 2, periodNumber: 1 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const parentNotifications = async (kind: string) => {
    const res = await api().get('/api/v1/notifications').query({ kind, pageSize: 50 }).set(bearer(parent.token)).expect(200);
    return res.body.items as any[];
  };

  describe('homeroom attendance', () => {
    it('saves the roll call and alerts parents of absences once per change', async () => {
      const res = await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({
          classId,
          date: today,
          records: [
            { studentId: studentIds[0], status: 'ABSENT', note: 'Ốm' },
            { studentId: studentIds[1], status: 'PRESENT' },
            { studentId: studentIds[2], status: 'LATE', note: 'Kẹt xe' },
          ],
        })
        .expect(200);
      expect(res.body.date).toBe(today);
      expect(res.body.class.id).toBe(classId);
      expect(res.body.summary).toEqual({ total: 3, present: 1, absent: 1, late: 1, excused: 0, unmarked: 0 });
      const byCode = Object.fromEntries(res.body.rows.map((r: any) => [r.student.code, r]));
      expect(byCode.HS1).toMatchObject({ status: 'ABSENT', note: 'Ốm', gate: { status: 'ABSENT', firstIn: null } });
      expect(byCode.HS3.status).toBe('LATE');

      const absent = await parentNotifications('HOMEROOM_ABSENT');
      expect(absent).toHaveLength(1);
      expect(absent[0].body).toBe(`Nguyễn Văn An vắng mặt buổi học ngày ${dmy(today)}: Ốm. Nếu có nhầm lẫn, vui lòng liên hệ giáo viên chủ nhiệm.`);
      expect(absent[0].student.id).toBe(studentIds[0]);
      expect(absent[0].data).toMatchObject({ classId, date: today, status: 'ABSENT' });

      // Saving again without a change is silent; a change of status alerts again.
      await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId, date: today, records: [{ studentId: studentIds[0], status: 'ABSENT', note: 'Ốm' }] })
        .expect(200);
      expect(await parentNotifications('HOMEROOM_ABSENT')).toHaveLength(1);
      await api().put('/api/v1/homeroom/attendance').set(teacher()).send({ classId, date: today, records: [{ studentId: studentIds[0], status: 'EXCUSED' }] }).expect(200);
      await api().put('/api/v1/homeroom/attendance').set(teacher()).send({ classId, date: today, records: [{ studentId: studentIds[0], status: 'ABSENT' }] }).expect(200);
      expect(await parentNotifications('HOMEROOM_ABSENT')).toHaveLength(2);
      expect(await parentNotifications('HOMEROOM_LATE')).toHaveLength(0);
    });

    it('validates the class, the roster and the date', async () => {
      const wrongClass = await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId: otherClassId, date: today, records: [{ studentId: otherStudentId, status: 'PRESENT' }] })
        .expect(403);
      expect(wrongClass.body.message).toBe('Bạn không phải giáo viên chủ nhiệm lớp này');
      await api().get('/api/v1/homeroom/attendance').query({ classId: otherClassId, date: today }).set(teacher()).expect(403);
      await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId, date: today, records: [{ studentId: otherStudentId, status: 'PRESENT' }] })
        .expect(400);
      await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId, date: vnDate(2), records: [{ studentId: studentIds[0], status: 'PRESENT' }] })
        .expect(400);
      await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId, date: today, records: [{ studentId: studentIds[0], status: 'NOPE' }] })
        .expect(400);
      // Office staff may mark any class.
      const other = await api()
        .put('/api/v1/homeroom/attendance')
        .set(staff())
        .send({ classId: otherClassId, date: today, records: [{ studentId: otherStudentId, status: 'PRESENT' }] })
        .expect(200);
      expect(other.body.summary).toMatchObject({ total: 1, present: 1 });
    });

    it('shows gate data and prefills unmarked students from it', async () => {
      const late = zonedToUtc(`${yesterday} 07:30:00`, TZ);
      const onTime = zonedToUtc(`${yesterday} 07:02:00`, TZ);
      await prisma.gateEvent.createMany({
        data: [
          { schoolId, studentId: studentIds[1], direction: 'IN', occurredAt: late, method: 'MANUAL', source: 'MANUAL' },
          { schoolId, studentId: studentIds[2], direction: 'IN', occurredAt: onTime, method: 'MANUAL', source: 'MANUAL' },
          { schoolId, studentId: studentIds[2], direction: 'OUT', occurredAt: zonedToUtc(`${yesterday} 11:30:00`, TZ), method: 'MANUAL', source: 'MANUAL' },
        ],
      });
      const sheet = await api().get('/api/v1/homeroom/attendance').query({ classId, date: yesterday }).set(teacher()).expect(200);
      expect(sheet.body.lateAfter).toBe('07:15');
      expect(sheet.body.summary).toEqual({ total: 3, present: 0, absent: 0, late: 0, excused: 0, unmarked: 3 });
      const rows = Object.fromEntries(sheet.body.rows.map((r: any) => [r.student.code, r]));
      expect(rows.HS1).toMatchObject({ status: null, gate: { status: 'ABSENT', firstIn: null, lastOut: null } });
      expect(rows.HS2).toMatchObject({ status: null, gate: { status: 'LATE', firstIn: late.toISOString() } });
      expect(rows.HS3.gate).toMatchObject({ status: 'ON_TIME', firstIn: onTime.toISOString() });
      expect(rows.HS3.gate.lastOut).not.toBeNull();

      const filled = await api().post('/api/v1/homeroom/attendance/prefill').set(teacher()).send({ classId, date: yesterday }).expect(200);
      expect(filled.body.summary).toEqual({ total: 3, present: 1, absent: 1, late: 1, excused: 0, unmarked: 0 });
      const after = Object.fromEntries(filled.body.rows.map((r: any) => [r.student.code, r]));
      expect(after.HS1.status).toBe('ABSENT');
      expect(after.HS2).toMatchObject({ status: 'LATE', note: 'Vào cổng lúc 07:30' });
      expect(after.HS3.status).toBe('PRESENT');
      const alerts = (await parentNotifications('HOMEROOM_ABSENT')).filter((n) => n.data.date === yesterday);
      expect(alerts).toHaveLength(1);

      // Prefill never overwrites what the teacher already marked.
      await api().put('/api/v1/homeroom/attendance').set(teacher()).send({ classId, date: yesterday, records: [{ studentId: studentIds[0], status: 'EXCUSED', note: 'Xin phép' }] }).expect(200);
      const again = await api().post('/api/v1/homeroom/attendance/prefill').set(teacher()).send({ classId, date: yesterday }).expect(200);
      expect(again.body.rows.find((r: any) => r.student.code === 'HS1')).toMatchObject({ status: 'EXCUSED', note: 'Xin phép' });
    });

    it('summarises the month and the whole school for a day', async () => {
      const month = await api().get('/api/v1/homeroom/attendance/summary').query({ classId, month: today.slice(0, 7) }).set(teacher()).expect(200);
      expect(month.body.month).toBe(today.slice(0, 7));
      const hs1 = month.body.students.find((s: any) => s.student.code === 'HS1');
      expect(hs1.days[today]).toMatchObject({ status: 'ABSENT' });
      expect(hs1.absent).toBeGreaterThanOrEqual(1);
      expect(month.body.days.find((d: any) => d.date === today)).toMatchObject({ total: 3, absent: 1, present: 1, late: 1 });
      await api().get('/api/v1/homeroom/attendance/summary').query({ classId, month: '2026-13' }).set(teacher()).expect(400);

      const daily = await api().get('/api/v1/homeroom/attendance/daily').query({ date: today }).set(admin()).expect(200);
      expect(daily.body.rows.find((r: any) => r.class.id === classId)).toMatchObject({ total: 3, marked: 3, absent: 1, present: 1, late: 1, excused: 0 });
      expect(daily.body.rows.find((r: any) => r.class.id === otherClassId)).toMatchObject({ total: 1, marked: 1, present: 1 });
      expect(daily.body.summary).toMatchObject({ classes: 2, classesMarked: 2, total: 4, marked: 4 });
      await api().get('/api/v1/homeroom/attendance/daily').query({ date: today }).set(teacher()).expect(403);
    });
  });

  describe('lesson logbook', () => {
    it('lets teachers write the periods they teach or any period of their homeroom class', async () => {
      const res = await api()
        .put('/api/v1/homeroom/logbook')
        .set(teacher())
        .send({ classId, date: LESSON_DAY, periodNumber: 1, subjectId, content: 'Bài 3: Phân số', comment: 'Lớp học sôi nổi', rating: 9, status: 'DONE', absentStudentIds: [studentIds[0]] })
        .expect(200);
      expect(res.body).toMatchObject({ date: LESSON_DAY, periodNumber: 1, semester: 1, rating: 9, status: 'DONE', absentStudentIds: [studentIds[0]] });
      expect(res.body.teacher.id).toBe(teacherId);
      expect(res.body.subject.code).toBe('TOAN');

      // Not their period and not their homeroom class.
      const forbidden = await api()
        .put('/api/v1/homeroom/logbook')
        .set(teacher())
        .send({ classId: otherClassId, date: LESSON_DAY, periodNumber: 1, subjectId, content: 'x', status: 'DONE' })
        .expect(403);
      expect(forbidden.body.message).toContain('không dạy tiết này');
      // Taught by someone else, but it is their homeroom class: allowed, and recorded under their own name.
      const homeroom = await api()
        .put('/api/v1/homeroom/logbook')
        .set(teacher())
        .send({ classId, date: LESSON_DAY, periodNumber: 2, subjectId, content: 'Giáo viên đi tập huấn', status: 'CANCELLED' })
        .expect(200);
      expect(homeroom.body).toMatchObject({ status: 'CANCELLED', rating: null, teacher: { id: teacherId } });
      // The office defaults to the timetabled teacher.
      const office = await api()
        .put('/api/v1/homeroom/logbook')
        .set(staff())
        .send({ classId: otherClassId, date: LESSON_DAY, periodNumber: 1, subjectId, content: 'Bài 1: Số tự nhiên', rating: 8, status: 'DONE' })
        .expect(200);
      expect(office.body.teacher.id).toBe(teacher2Id);

      await api().put('/api/v1/homeroom/logbook').set(teacher()).send({ classId, date: LESSON_DAY, periodNumber: 3, subjectId, content: 'x', rating: 11, status: 'DONE' }).expect(400);
      await api().put('/api/v1/homeroom/logbook').set(teacher()).send({ classId, date: LESSON_DAY, periodNumber: 3, subjectId, content: '', status: 'DONE' }).expect(400);
      await api()
        .put('/api/v1/homeroom/logbook')
        .set(teacher())
        .send({ classId, date: LESSON_DAY, periodNumber: 3, subjectId, content: 'x', status: 'DONE', absentStudentIds: [otherStudentId] })
        .expect(400);
    });

    it('lists the week with timetable slots joined to entries, and reports stats', async () => {
      const res = await api().get('/api/v1/homeroom/logbook').query({ classId, from: LESSON_DAY, to: '2026-10-11' }).set(teacher()).expect(200);
      expect(res.body.days.map((d: any) => d.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
      // Roster order is by full name: Châu, An, Bình.
      expect(res.body.students.map((s: any) => s.code)).toEqual(['HS3', 'HS1', 'HS2']);
      const tuesday = res.body.days[0];
      expect(tuesday).toMatchObject({ dayOfWeek: 2, semester: 1 });
      expect(tuesday.slots).toHaveLength(2);
      expect(tuesday.slots[0]).toMatchObject({ periodNumber: 1, scheduled: true, teacher: { id: teacherId }, log: { content: 'Bài 3: Phân số', rating: 9 } });
      expect(tuesday.slots[1]).toMatchObject({ periodNumber: 2, teacher: { id: teacher2Id }, log: { status: 'CANCELLED', teacher: { id: teacherId } } });
      expect(res.body.days[1].slots).toEqual([]);
      await api().get('/api/v1/homeroom/logbook').query({ classId, from: LESSON_DAY, to: '2026-10-25' }).set(teacher()).expect(400);
      await api().get('/api/v1/homeroom/logbook').query({ classId, from: LESSON_DAY, to: '2026-10-01' }).set(teacher()).expect(400);

      const stats = await api().get('/api/v1/homeroom/logbook/stats').query({ classId, from: LESSON_DAY, to: LESSON_DAY }).set(teacher()).expect(200);
      expect(stats.body.lessons).toEqual({ total: 2, done: 1, cancelled: 1 });
      expect(stats.body.averageRating).toBe(9);
      expect(stats.body.absences).toEqual([{ student: { id: studentIds[0], code: 'HS1', fullName: 'Nguyễn Văn An' }, count: 1 }]);
    });
  });

  describe('announcements', () => {
    let eventId: string;

    it('creates, previews, sends and collects RSVPs', async () => {
      const eventAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const created = await api()
        .post('/api/v1/announcements')
        .set(admin())
        .send({ kind: 'EVENT', title: 'Họp phụ huynh đầu năm', body: 'Kính mời phụ huynh lớp 6A.', eventAt, location: 'Phòng P.101', rsvp: true, audience: { classIds: [classId] } })
        .expect(201);
      eventId = created.body.id;
      expect(created.body).toMatchObject({ status: 'DRAFT', channels: ['IN_APP'], recipients: 0, audience: { roles: [], classIds: [classId], gradeLevels: [] } });
      await api().post('/api/v1/announcements').set(admin()).send({ kind: 'EVENT', title: 'x', body: 'y', audience: { classIds: [classId] } }).expect(400);
      await api().post('/api/v1/announcements').set(admin()).send({ kind: 'ANNOUNCEMENT', title: 'x', body: 'y', audience: {} }).expect(400);
      await api().post('/api/v1/announcements').set(admin()).send({ kind: 'ANNOUNCEMENT', title: 'x', body: 'y', audience: { classIds: ['nope'] } }).expect(400);

      // The parent of a 6A student and the homeroom teacher's account.
      const preview = await api().post(`/api/v1/announcements/${eventId}/preview`).set(admin()).expect(200);
      expect(preview.body).toEqual({ recipients: 2, byRole: { PARENT: 1, TEACHER: 1 } });

      const sent = await api().post(`/api/v1/announcements/${eventId}/send`).set(admin()).expect(200);
      expect(sent.body).toMatchObject({ status: 'SENT', recipients: 2 });
      expect(sent.body.sentAt).toBeTruthy();
      await api().post(`/api/v1/announcements/${eventId}/send`).set(admin()).expect(400);
      await api().patch(`/api/v1/announcements/${eventId}`).set(admin()).send({ title: 'z' }).expect(400);
      await api().delete(`/api/v1/announcements/${eventId}`).set(admin()).expect(400);

      const events = await parentNotifications('EVENT');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ announcementId: eventId, title: 'Họp phụ huynh đầu năm', announcement: { kind: 'EVENT', location: 'Phòng P.101', rsvp: true, responses: [] } });
      expect(events[0].data).toMatchObject({ eventAt, location: 'Phòng P.101', rsvp: true });

      const rsvp = await api().post(`/api/v1/announcements/${eventId}/rsvp`).set(bearer(parent.token)).send({ response: 'MAYBE' }).expect(200);
      expect(rsvp.body.response).toBe('MAYBE');
      await api().post(`/api/v1/announcements/${eventId}/rsvp`).set(bearer(parent.token)).send({ response: 'GOING' }).expect(200);
      expect((await api().get(`/api/v1/announcements/${eventId}/rsvp`).set(bearer(parent.token)).expect(200)).body.response).toBe('GOING');
      // Someone who did not receive it cannot answer; the office cannot answer for them.
      await api().post(`/api/v1/announcements/${eventId}/rsvp`).set(staff()).send({ response: 'GOING' }).expect(403);
      await api().post(`/api/v1/announcements/${eventId}/rsvp`).set(bearer(parent.token)).send({ response: 'YES' }).expect(400);
      await api().post(`/api/v1/notifications/${events[0].id}/read`).set(bearer(parent.token)).expect(200);

      const detail = await api().get(`/api/v1/announcements/${eventId}`).set(admin()).expect(200);
      expect(detail.body).toMatchObject({ recipients: 2, readCount: 1, rsvpCounts: { GOING: 1, NOT_GOING: 0, MAYBE: 0 } });
      expect(detail.body.responses).toHaveLength(1);
      expect(detail.body.responses[0]).toMatchObject({ response: 'GOING', user: { id: parent.user.id, fullName: 'Phụ huynh', role: 'PARENT' } });

      const mine = await api().get('/api/v1/announcements/mine').set(bearer(parent.token)).expect(200);
      expect(mine.body.total).toBe(1);
      expect(mine.body.items[0]).toMatchObject({ id: eventId, kind: 'EVENT', myResponse: 'GOING', notificationId: events[0].id });
      expect(mine.body.items[0].readAt).toBeTruthy();
      expect(mine.body.items[0].audience).toBeUndefined();
      // The homeroom teacher received it too; the office did not.
      expect((await api().get('/api/v1/announcements/mine').set(teacher()).expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/announcements/mine').set(admin()).expect(200)).body.total).toBe(0);

      const list = await api().get('/api/v1/announcements').set(staff()).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({ id: eventId, readCount: 1, rsvpCounts: { GOING: 1 } });
    });

    it('sends scheduled announcements when their time has come', async () => {
      const due = await api()
        .post('/api/v1/announcements')
        .set(admin())
        .send({ kind: 'ANNOUNCEMENT', title: 'Lịch nghỉ lễ', body: 'Nghỉ ngày 20/11.', audience: { roles: ['PARENT'] }, scheduledAt: new Date(Date.now() - 1000).toISOString() })
        .expect(201);
      expect(due.body.status).toBe('SCHEDULED');
      const later = await api()
        .post('/api/v1/announcements')
        .set(admin())
        .send({ kind: 'ANNOUNCEMENT', title: 'Tuần sau', body: '...', audience: { gradeLevels: [6] }, channels: ['ZALO'], scheduledAt: new Date(Date.now() + 3_600_000).toISOString() })
        .expect(201);
      expect(later.body.channels).toEqual(['IN_APP', 'ZALO']);

      const run1 = await api().post('/api/v1/announcements/run-scheduled').set(admin()).expect(200);
      expect(run1.body).toEqual({ sent: 1 });
      expect((await api().get(`/api/v1/announcements/${due.body.id}`).set(admin()).expect(200)).body).toMatchObject({ status: 'SENT', recipients: 1 });
      expect((await api().get(`/api/v1/announcements/${later.body.id}`).set(admin()).expect(200)).body.status).toBe('SCHEDULED');
      expect(await parentNotifications('ANNOUNCEMENT')).toHaveLength(1);
      // An announcement without RSVP does not take answers.
      await api().post(`/api/v1/announcements/${due.body.id}/rsvp`).set(bearer(parent.token)).send({ response: 'GOING' }).expect(400);

      // Grade-level preview reaches the parent and both homeroom teachers (one has no account).
      expect((await api().post(`/api/v1/announcements/${later.body.id}/preview`).set(staff()).expect(200)).body).toEqual({ recipients: 2, byRole: { PARENT: 1, TEACHER: 1 } });
      const unscheduled = await api().patch(`/api/v1/announcements/${later.body.id}`).set(staff()).send({ scheduledAt: null, title: 'Tuần sau nữa' }).expect(200);
      expect(unscheduled.body).toMatchObject({ status: 'DRAFT', scheduledAt: null, title: 'Tuần sau nữa' });
      expect((await api().post('/api/v1/announcements/run-scheduled').set(admin()).expect(200)).body).toEqual({ sent: 0 });
      await api().delete(`/api/v1/announcements/${later.body.id}`).set(staff()).expect(200);
      await api().get(`/api/v1/announcements/${later.body.id}`).set(staff()).expect(404);
    });

    it('limits teachers to their own homeroom classes', async () => {
      const base = { kind: 'ANNOUNCEMENT', title: 'Nhắc nộp bài', body: 'Hạn thứ Sáu.' };
      const roles = await api().post('/api/v1/announcements').set(teacher()).send({ ...base, audience: { roles: ['PARENT'] } }).expect(403);
      expect(roles.body.message).toBe('Giáo viên chỉ được gửi thông báo tới lớp mình chủ nhiệm');
      await api().post('/api/v1/announcements').set(teacher()).send({ ...base, audience: { classIds: [otherClassId] } }).expect(403);
      const own = await api().post('/api/v1/announcements').set(teacher()).send({ ...base, audience: { classIds: [classId] } }).expect(201);
      await api().patch(`/api/v1/announcements/${own.body.id}`).set(teacher()).send({ audience: { classIds: [classId, otherClassId] } }).expect(403);
      expect((await api().post(`/api/v1/announcements/${own.body.id}/send`).set(teacher()).expect(200)).body.recipients).toBe(2);
      // Teachers only see what they wrote; the office sees everything.
      const list = await api().get('/api/v1/announcements').set(teacher()).expect(200);
      expect(list.body.items.map((a: any) => a.id)).toEqual([own.body.id]);
      await api().get(`/api/v1/announcements/${eventId}`).set(teacher()).expect(404);
      expect((await api().get('/api/v1/announcements').set(admin()).expect(200)).body.total).toBe(3);
    });

    it('keeps schools apart', async () => {
      const other = bearer(otherTokens.ADMIN);
      expect((await api().get('/api/v1/announcements').set(other).expect(200)).body.total).toBe(0);
      await api().get(`/api/v1/announcements/${eventId}`).set(other).expect(404);
      await api().post(`/api/v1/announcements/${eventId}/send`).set(other).expect(404);
      await api().post('/api/v1/announcements').set(other).send({ kind: 'ANNOUNCEMENT', title: 'x', body: 'y', audience: { classIds: [classId] } }).expect(400);
      await api().get('/api/v1/homeroom/attendance').query({ classId, date: today }).set(other).expect(404);
      await api().get('/api/v1/homeroom/logbook').query({ classId }).set(other).expect(404);
      await api().get('/api/v1/homeroom/attendance/summary').query({ classId, month: today.slice(0, 7) }).set(other).expect(404);
      expect((await api().get('/api/v1/homeroom/attendance/daily').query({ date: today }).set(other).expect(200)).body.rows).toEqual([]);
    });
  });
});

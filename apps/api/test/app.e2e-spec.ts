import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

// Runs against a real Postgres (DATABASE_URL). Each run creates its own schools,
// so it doesn't depend on the seed data.
describe('Phase 1 API (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const run = Date.now().toString(36);
  let token: string;
  let otherToken: string;
  // Events are dated yesterday (school-local) so they are never "in the future" whatever time CI runs.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() - 86_400_000));

  const api = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  async function createSchoolWithAdmin(code: string) {
    const school = await prisma.school.create({ data: { code, name: `Trường ${code}`, lateAfter: '07:15' } });
    const email = `admin-${code}@test.vn`.toLowerCase();
    await prisma.user.create({
      data: { schoolId: school.id, email, fullName: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash('Secret@123', 4) },
    });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Secret@123' }).expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    token = await createSchoolWithAdmin(`A${run}`);
    otherToken = await createSchoolWithAdmin(`B${run}`);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects requests without a token and bad credentials', async () => {
    await api().get('/api/v1/teachers').expect(401);
    await api().post('/api/v1/auth/login').send({ email: 'nobody@test.vn', password: 'whatever1' }).expect(401);
  });

  let subjectId: string;
  let teacherId: string;
  let teacher2Id: string;
  let classId: string;
  let class2Id: string;
  let studentId: string;

  it('sets up a school year, subjects, periods, teachers and classes', async () => {
    await api().post('/api/v1/academic-years').set(auth()).send({ name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31', isCurrent: true }).expect(201);
    subjectId = (await api().post('/api/v1/subjects').set(auth()).send({ code: 'TOAN', name: 'Toán' }).expect(201)).body.id;
    await api().post('/api/v1/subjects').set(auth()).send({ code: 'TOAN', name: 'Toán' }).expect(409);
    await api()
      .put('/api/v1/periods')
      .set(auth())
      .send({ periods: [{ number: 1, session: 'MORNING', startTime: '07:30', endTime: '08:15' }] })
      .expect(200);

    const t = await api()
      .post('/api/v1/teachers')
      .set(auth())
      .send({ code: 'GV1', fullName: 'Nguyễn Thị Lan', email: `lan-${run}@test.vn`, password: 'Teacher@123', subjectIds: [subjectId] })
      .expect(201);
    teacherId = t.body.id;
    expect(t.body.subjects[0].subject.name).toBe('Toán');
    expect(t.body.user.email).toBe(`lan-${run}@test.vn`);
    teacher2Id = (await api().post('/api/v1/teachers').set(auth()).send({ code: 'GV2', fullName: 'Trần Văn Hùng' }).expect(201)).body.id;

    // The teacher can log in but cannot manage teachers.
    const login = await api().post('/api/v1/auth/login').send({ email: `lan-${run}@test.vn`, password: 'Teacher@123' }).expect(200);
    await api().post('/api/v1/teachers').set(auth(login.body.accessToken)).send({ code: 'X', fullName: 'X' }).expect(403);

    classId = (await api().post('/api/v1/classes').set(auth()).send({ name: '6A1', gradeLevel: 6, homeroomTeacherId: teacherId, room: 'P.101' }).expect(201)).body.id;
    class2Id = (await api().post('/api/v1/classes').set(auth()).send({ name: '6A2', gradeLevel: 6, room: 'P.102' }).expect(201)).body.id;
    await api().post('/api/v1/classes').set(auth()).send({ name: '6A1', gradeLevel: 6 }).expect(409);
  });

  it('creates students with guardians and enrols them', async () => {
    const s = await api()
      .post('/api/v1/students')
      .set(auth())
      .send({
        code: 'HS1',
        fullName: 'Trần Minh Anh',
        gender: 'FEMALE',
        dateOfBirth: '2014-03-21',
        classId,
        guardians: [{ fullName: 'Trần Văn Nam', relationship: 'FATHER', phone: '0987654321', isPrimary: true }],
      })
      .expect(201);
    studentId = s.body.id;
    expect(s.body.enrollments[0].class.name).toBe('6A1');

    const other = (await api().post('/api/v1/students').set(auth()).send({ code: 'HS2', fullName: 'Lê Gia Huy' }).expect(201)).body.id;
    await api().post(`/api/v1/classes/${class2Id}/students`).set(auth()).send({ studentIds: [other] }).expect(201);

    const list = await api().get('/api/v1/students').query({ classId, q: 'minh' }).set(auth()).expect(200);
    expect(list.body.total).toBe(1);
    const classes = await api().get('/api/v1/classes').set(auth()).expect(200);
    expect(classes.body.map((c: any) => c._count.enrollments)).toEqual([1, 1]);
  });

  it('keeps schools isolated', async () => {
    await api().get(`/api/v1/teachers/${teacherId}`).set(auth(otherToken)).expect(404);
    const list = await api().get('/api/v1/students').set(auth(otherToken)).expect(200);
    expect(list.body.total).toBe(0);
  });

  it('builds a timetable and blocks double-booking', async () => {
    const slot = { classId, subjectId, teacherId, semester: 1, dayOfWeek: 1, periodNumber: 1 };
    const entry = await api().post('/api/v1/timetable').set(auth()).send(slot).expect(201);
    expect(entry.body.room).toBe('P.101');

    const sameClass = await api().post('/api/v1/timetable').set(auth()).send({ ...slot, teacherId: teacher2Id }).expect(409);
    expect(sameClass.body.conflicts[0].kind).toBe('CLASS');
    const sameTeacher = await api().post('/api/v1/timetable').set(auth()).send({ ...slot, classId: class2Id }).expect(409);
    expect(sameTeacher.body.conflicts[0].kind).toBe('TEACHER');
    const sameRoom = await api().post('/api/v1/timetable').set(auth()).send({ ...slot, classId: class2Id, teacherId: teacher2Id, room: 'p.101' }).expect(409);
    expect(sameRoom.body.conflicts[0].kind).toBe('ROOM');
    await api().post('/api/v1/timetable').set(auth()).send({ ...slot, periodNumber: 9 }).expect(400);

    const tt = await api().get('/api/v1/timetable').query({ teacherId }).set(auth()).expect(200);
    expect(tt.body).toHaveLength(1);
  });

  describe('gate attendance', () => {
    let deviceKey: string;

    it('registers a device and returns its key once', async () => {
      const d = await api().post('/api/v1/attendance/devices').set(auth()).send({ name: 'Cổng chính', type: 'FACE', serialNumber: `SN${run}` }).expect(201);
      deviceKey = d.body.apiKey;
      expect(deviceKey).toMatch(/^sk_dev_/);
      const list = await api().get('/api/v1/attendance/devices').set(auth()).expect(200);
      expect(list.body[0].apiKey).toBeUndefined();
      expect(list.body[0].apiKeyHash).toBeUndefined();
    });

    it('requires consent before linking biometric data', async () => {
      await api().post('/api/v1/attendance/identities').set(auth()).send({ method: 'BIOMETRIC', externalId: '1001', studentId }).expect(400);
    });

    it('ingests device events idempotently and links unmatched ones later', async () => {
      await api().post('/api/v1/attendance/ingest').set('X-Device-Key', 'sk_dev_000000000000.nope-nope-nope-nope-nope-nope-nope').send({ events: [{ personId: '1', occurredAt: `${day}T07:00:00+07:00` }] }).expect(401);

      const events = [
        { eventId: 'e1', personId: '1001', occurredAt: `${day}T07:20:00+07:00`, method: 'FACE', direction: 'IN' },
        { eventId: 'e2', personId: '1001', occurredAt: `${day} 16:30:00`, method: 'FACE', direction: 'OUT' },
      ];
      const first = await api().post('/api/v1/attendance/ingest').set('X-Device-Key', deviceKey).send({ events }).expect(200);
      expect(first.body).toMatchObject({ accepted: 0, unmatched: 2, duplicates: 0 });
      const again = await api().post('/api/v1/attendance/ingest').set('X-Device-Key', deviceKey).send({ events }).expect(200);
      expect(again.body).toMatchObject({ unmatched: 0, duplicates: 2 });

      // Recording consent links the earlier events to the student.
      await api()
        .post('/api/v1/attendance/identities')
        .set(auth())
        .send({ method: 'BIOMETRIC', externalId: '1001', studentId, consentGivenBy: 'Trần Văn Nam', consentRelationship: 'Cha', consentAt: '2026-09-01' })
        .expect(201);
      const unmatched = await api().get('/api/v1/attendance/events').query({ unmatched: true, date: day }).set(auth()).expect(200);
      expect(unmatched.body.total).toBe(0);

      const daily = await api().get('/api/v1/attendance/daily').query({ classId, date: day }).set(auth()).expect(200);
      expect(daily.body.summary).toEqual({ total: 1, onTime: 0, late: 1, absent: 0 });
      expect(new Date(daily.body.rows[0].lastOut).toISOString()).toBe(new Date(`${day}T16:30:00+07:00`).toISOString());
    });

    it('accepts ZKTeco ADMS pushes by serial number', async () => {
      const t = await api().post('/api/v1/teachers').set(auth()).send({ code: 'GV3', fullName: 'Phạm Quốc Bảo' }).expect(201);
      await api().post('/api/v1/attendance/identities').set(auth()).send({ method: 'CARD', externalId: '2001', teacherId: t.body.id }).expect(201);

      const hs = await api().get('/iclock/cdata').query({ SN: `SN${run}`, options: 'all' }).expect(200);
      expect(hs.text).toContain(`GET OPTION FROM: SN${run}`);
      const push = await api()
        .post('/iclock/cdata')
        .query({ SN: `SN${run}`, table: 'ATTLOG', Stamp: '1' })
        .set('Content-Type', 'text/plain')
        .send(`2001\t${day} 07:05:00\t0\t4\t0\t0\n`)
        .expect(200);
      expect(push.text).toBe('OK: 1');
      await api().get('/iclock/cdata').query({ SN: 'unknown' }).expect(401);

      const daily = await api().get('/api/v1/attendance/daily').query({ personType: 'TEACHER', date: day }).set(auth()).expect(200);
      const row = daily.body.rows.find((r: any) => r.person.id === t.body.id);
      expect(row.status).toBe('ON_TIME');
    });

    it('records manual check-ins', async () => {
      const ev = await api().post('/api/v1/attendance/manual').set(auth()).send({ teacherId: teacher2Id, direction: 'IN', note: 'Quên thẻ' }).expect(201);
      expect(ev.body).toMatchObject({ method: 'MANUAL', source: 'MANUAL', direction: 'IN' });
      await api().post('/api/v1/attendance/manual').set(auth()).send({ direction: 'IN' }).expect(400);
      await api().post('/api/v1/attendance/manual').set(auth(otherToken)).send({ teacherId: teacher2Id, direction: 'IN' }).expect(404);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { localDate, zonedToUtc } from '../src/common/time';
import { addDays } from '../src/stats/daily-stats.service';
import { bearer, createApp, createClass, createDistrict, createSchool, createStudent, prisma, runId, waitFor } from './helpers';

// Phase 5: hardening (health probe, headers, rate limit), audit log, daily statistics and alerts,
// the district portal and the MOET exchange adapter.
describe('Platform, district and MOET (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let other: Awaited<ReturnType<typeof createSchool>>;
  let district: Awaited<ReturnType<typeof createDistrict>>;
  let classId: string;
  let students: Awaited<ReturnType<typeof createStudent>>[];
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);
  const officer = () => bearer(district.token);
  const TZ = 'Asia/Ho_Chi_Minh';
  /** The last Monday–Saturday before today: the day whose statistics the tests compute. */
  let date: string;
  let schoolRuleId: string;
  let districtRuleId: string;
  let eventIds: string[] = [];

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `P5A${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    other = await createSchool(app, `P5B${run}`);
    district = await createDistrict(app, `D${run}`);
    classId = (await createClass(schoolId, '6A')).id;
    students = [];
    for (const name of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu', 'Phạm Quốc Dũng']) students.push(await createStudent(app, schoolId, { classId, fullName: name }));
    date = addDays(localDate(new Date(), TZ), -1);
    while (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) date = addDays(date, -1);
    // Three students came in (one late), the fourth never did.
    for (const [i, time] of [['0', '07:00:00'], ['1', '07:05:00'], ['2', '07:40:00']] as const) {
      await api()
        .post('/api/v1/attendance/manual')
        .set(staff())
        .send({ studentId: students[+i].student.id, direction: 'IN', occurredAt: zonedToUtc(`${date} ${time}`, TZ).toISOString() })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('hardening', () => {
    it('serves the health probe without a token or prefix', async () => {
      const res = await api().get('/healthz').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
      expect(res.body.uptimeSec).toBeGreaterThanOrEqual(0);
    });

    it('sets security headers and hides the server stack', async () => {
      const res = await api().get('/healthz').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('signs district officers in without a school', () => {
      expect(district.login.user).toMatchObject({ role: 'DISTRICT', school: null, district: { code: `D${run}`, level: 'PHONG' } });
    });

    it('keeps district officers out of school routes and school staff out of the district portal', async () => {
      await api().get('/api/v1/students').set(officer()).expect(403);
      await api().get('/api/v1/district/overview').set(admin()).expect(403);
      await api().get('/api/v1/district/overview').set(teacher()).expect(403);
    });

    it('rate-limits once RATE_LIMIT_PER_MIN is set, with a stricter login limit', async () => {
      process.env.RATE_LIMIT_PER_MIN = '3';
      process.env.AUTH_RATE_LIMIT_PER_MIN = '2';
      try {
        for (let i = 0; i < 3; i++) await api().get('/api/v1/districts').set(admin()).expect(200);
        const blocked = await api().get('/api/v1/districts').set(admin()).expect(429);
        expect(blocked.headers['retry-after']).toBeDefined();
        await api().get('/healthz').expect(200); // probes are never throttled
        const bad = { email: `admin-p5a${run}@test.vn`.toLowerCase(), password: 'Wrong@123' };
        await api().post('/api/v1/auth/login').send(bad).expect(401);
        await api().post('/api/v1/auth/login').send(bad).expect(401);
        await api().post('/api/v1/auth/login').send(bad).expect(429);
      } finally {
        process.env.RATE_LIMIT_PER_MIN = '0';
        delete process.env.AUTH_RATE_LIMIT_PER_MIN;
      }
    });
  });

  describe('school settings', () => {
    it('lists districts and lets the admin attach the school with its MOET code', async () => {
      const list = await api().get('/api/v1/districts').set(staff()).expect(200);
      expect(list.body.some((d: any) => d.id === district.district.id)).toBe(true);
      const res = await api()
        .patch('/api/v1/school')
        .set(admin())
        .send({ districtId: district.district.id, moetCode: `01-${run}`, province: 'Hà Nội', lateAfter: '07:15', address: 'Cầu Giấy' })
        .expect(200);
      expect(res.body).toMatchObject({ moetCode: `01-${run}`, province: 'Hà Nội', district: { code: `D${run}` } });
      const me = await api().get('/api/v1/school').set(teacher()).expect(200);
      expect(me.body.district.id).toBe(district.district.id);
    });

    it('rejects bad values and non-admins', async () => {
      await api().patch('/api/v1/school').set(admin()).send({ lateAfter: '7h15' }).expect(400);
      await api().patch('/api/v1/school').set(admin()).send({ timezone: 'Mars/Olympus' }).expect(400);
      await api().patch('/api/v1/school').set(admin()).send({ districtId: 'nope' }).expect(404);
      await api().patch('/api/v1/school').set(staff()).send({ name: 'x' }).expect(403);
    });
  });

  describe('audit log', () => {
    it('records state-changing calls with the password redacted and the outcome', async () => {
      const email = `admin-p5a${run}@test.vn`.toLowerCase();
      await api().post('/api/v1/auth/login').send({ email, password: 'Nope@123' }).expect(401);
      const rows = await waitFor(async () => {
        const res = await api().get('/api/v1/audit').set(admin()).query({ pageSize: 50 }).expect(200);
        const items = res.body.items as any[];
        return items.some((i) => i.path === '/api/v1/school' && i.method === 'PATCH') && items.some((i) => i.path === '/api/v1/auth/login' && i.statusCode === 401 && i.body?.email === email)
          ? items
          : null;
      });
      const patch = rows.find((i) => i.path === '/api/v1/school' && i.method === 'PATCH' && i.statusCode === 200);
      expect(patch).toMatchObject({ area: 'school', userRole: 'ADMIN', user: { email: `admin-p5a${run}@test.vn`.toLowerCase() }, body: { moetCode: `01-${run}` } });
      expect(patch.durationMs).toBeGreaterThanOrEqual(0);
      const login = rows.find((i) => i.path === '/api/v1/auth/login' && i.statusCode === 401 && i.body?.email === email);
      expect(login.body.password).toBe('[đã ẩn]');
      expect(login.userId).toBeNull();
      // Reads are not logged.
      expect(rows.some((i) => i.method === 'GET')).toBe(false);
    });

    it('filters and scopes per school', async () => {
      const failed = await api().get('/api/v1/audit').set(admin()).query({ failed: true }).expect(200);
      expect(failed.body.items.every((i: any) => i.statusCode >= 400)).toBe(true);
      const areas = await api().get('/api/v1/audit/areas').set(admin()).expect(200);
      expect(areas.body).toContain('school');
      const otherRows = await api().get('/api/v1/audit').set(bearer(other.tokens.ADMIN)).expect(200);
      expect(otherRows.body.items.some((i: any) => i.path === '/api/v1/school')).toBe(false);
      await api().get('/api/v1/audit').set(staff()).expect(403);
    });
  });

  describe('daily statistics', () => {
    it('computes attendance, fees and activity for a day', async () => {
      const res = await api().post('/api/v1/stats/recompute').set(admin()).send({ from: date, to: date }).expect(200);
      expect(res.body.days).toBe(1);
      const daily = await api().get('/api/v1/stats/daily').set(teacher()).query({ from: date, to: date }).expect(200);
      expect(daily.body.items).toHaveLength(1);
      expect(daily.body.items[0]).toMatchObject({ date, students: 4, present: 3, late: 1, absent: 1, attendanceRate: 75, revenue: 0, overdueAmount: 0, healthIncidents: 0 });
    });

    it('summarises today and the trend window', async () => {
      const res = await api().get('/api/v1/stats/summary').set(admin()).query({ days: 7 }).expect(200);
      expect(res.body.trend).toHaveLength(7);
      expect(res.body.today.students).toBe(4);
      expect(res.body.window.days).toBe(7);
      expect(res.body.trend.find((t: any) => t.date === date)).toMatchObject({ present: 3, late: 1 });
      await api().post('/api/v1/stats/recompute').set(admin()).send({ from: '2026-01-01', to: '2026-12-31' }).expect(400);
      await api().post('/api/v1/stats/recompute').set(staff()).send({ from: date, to: date }).expect(403);
    });
  });

  describe('alerts', () => {
    it('lets the school and the district define rules', async () => {
      const r1 = await api().post('/api/v1/alerts/rules').set(admin()).send({ kind: 'ATTENDANCE_RATE_BELOW', name: 'Chuyên cần dưới 90%', threshold: 90 }).expect(201);
      schoolRuleId = r1.body.id;
      const r2 = await api().post('/api/v1/district/rules').set(officer()).send({ kind: 'ABSENT_STREAK', name: 'Vắng 2 ngày liên tiếp', threshold: 2 }).expect(201);
      districtRuleId = r2.body.id;
      await api().post('/api/v1/district/rules').set(officer()).send({ kind: 'LATE_RATE_ABOVE', name: 'Đi muộn trên 10%', threshold: 10 }).expect(201);
      await api().post('/api/v1/alerts/rules').set(admin()).send({ kind: 'OVERDUE_FEES_ABOVE', name: 'Nợ quá hạn', threshold: 1_000_000 }).expect(201);
      await api().post('/api/v1/alerts/rules').set(staff()).send({ kind: 'ATTENDANCE_RATE_BELOW', name: 'x', threshold: 1 }).expect(403);
      const mine = await api().get('/api/v1/alerts/rules').set(teacher()).expect(200);
      expect(mine.body.map((r: any) => r.kind).sort()).toEqual(['ATTENDANCE_RATE_BELOW', 'OVERDUE_FEES_ABOVE']);
      const theirs = await api().get('/api/v1/district/rules').set(officer()).expect(200);
      expect(theirs.body).toHaveLength(2);
      // A district rule is not the school's to delete, and vice versa.
      await api().delete(`/api/v1/alerts/rules/${districtRuleId}`).set(admin()).expect(404);
      await api().delete(`/api/v1/district/rules/${schoolRuleId}`).set(officer()).expect(404);
    });

    it('raises one event per rule and day, notifying admins and officers', async () => {
      const res = await api().post('/api/v1/alerts/evaluate').set(admin()).send({ date }).expect(200);
      expect(res.body).toMatchObject({ date, fired: 3, created: 3 });
      const again = await api().post('/api/v1/alerts/evaluate').set(admin()).send({ date }).expect(200);
      expect(again.body).toMatchObject({ fired: 3, created: 0 });
      const events = await api().get('/api/v1/alerts/events').set(teacher()).query({ open: true }).expect(200);
      expect(events.body.total).toBe(3);
      const kinds = events.body.items.map((e: any) => e.kind).sort();
      expect(kinds).toEqual(['ABSENT_STREAK', 'ATTENDANCE_RATE_BELOW', 'LATE_RATE_ABOVE']);
      const streak = events.body.items.find((e: any) => e.kind === 'ABSENT_STREAK');
      expect(streak.message).toContain('Phạm Quốc Dũng');
      expect(events.body.items.find((e: any) => e.kind === 'ATTENDANCE_RATE_BELOW')).toMatchObject({ value: 75, threshold: 90, rule: { name: 'Chuyên cần dưới 90%' } });
      eventIds = events.body.items.map((e: any) => e.id);
      const adminNotes = await api().get('/api/v1/notifications').set(admin()).query({ kind: 'ALERT' }).expect(200);
      expect(adminNotes.body.total).toBe(3);
      const officerNotes = await api().get('/api/v1/notifications').set(officer()).query({ kind: 'ALERT' }).expect(200);
      expect(officerNotes.body.total).toBe(3);
      expect(officerNotes.body.items[0].title).toContain('Cảnh báo');
    });

    it('acknowledges events and pauses rules', async () => {
      const ack = await api().post(`/api/v1/alerts/events/${eventIds[0]}/ack`).set(staff()).expect(200);
      expect(ack.body.acknowledgedAt).toBeTruthy();
      const open = await api().get('/api/v1/alerts/events').set(admin()).query({ open: true }).expect(200);
      expect(open.body.total).toBe(2);
      await api().post(`/api/v1/alerts/events/${eventIds[0]}/ack`).set(bearer(other.tokens.ADMIN)).expect(404);
      await api().patch(`/api/v1/alerts/rules/${schoolRuleId}`).set(admin()).send({ isActive: false, threshold: 95 }).expect(200);
      const rules = await api().get('/api/v1/alerts/rules').set(admin()).expect(200);
      expect(rules.body.find((r: any) => r.id === schoolRuleId)).toMatchObject({ isActive: false, threshold: '95' });
    });
  });

  describe('district portal', () => {
    it('shows the overview for a day with one line per school', async () => {
      const res = await api().get('/api/v1/district/overview').set(officer()).query({ date }).expect(200);
      expect(res.body.district.code).toBe(`D${run}`);
      expect(res.body.totals).toMatchObject({ schools: 1, students: 4, reported: 1, present: 3, late: 1, attendanceRate: 75, openAlerts: 2 });
      expect(res.body.schools).toHaveLength(1);
      expect(res.body.schools[0]).toMatchObject({ id: schoolId, students: 4, classes: 1, openAlerts: 2, stat: { present: 3, late: 1, lateRate: 25 } });
      const today = await api().get('/api/v1/district/overview').set(officer()).expect(200);
      expect(today.body.date).toBe(localDate(new Date(), TZ));
    });

    it('shows the trend and one school in detail, but not other districts’ schools', async () => {
      const trend = await api().get('/api/v1/district/trend').set(officer()).query({ days: 7 }).expect(200);
      expect(trend.body.items).toHaveLength(7);
      expect(trend.body.items.find((t: any) => t.date === date)).toMatchObject({ schools: 1, present: 3 });
      const detail = await api().get(`/api/v1/district/schools/${schoolId}`).set(officer()).query({ days: 7 }).expect(200);
      expect(detail.body.school.code).toBe(`P5A${run}`);
      expect(detail.body.counts).toMatchObject({ students: 4, classes: 1 });
      expect(detail.body.classes[0]).toMatchObject({ name: '6A', students: 4 });
      expect(detail.body.stats.some((s: any) => s.date === date)).toBe(true);
      expect(detail.body.alerts).toHaveLength(3);
      expect(detail.body.contacts[0].email).toBe(`admin-p5a${run}@test.vn`.toLowerCase());
      await api().get(`/api/v1/district/schools/${other.school.id}`).set(officer()).expect(404);
    });

    it('lists and acknowledges alerts across the district', async () => {
      const list = await api().get('/api/v1/district/alerts').set(officer()).query({ open: true }).expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.items[0].school.code).toBe(`P5A${run}`);
      await api().post(`/api/v1/district/alerts/${eventIds[1]}/ack`).set(officer()).expect(200);
      const after = await api().get('/api/v1/district/alerts').set(officer()).query({ open: true }).expect(200);
      expect(after.body.total).toBe(1);
      const bySchool = await api().get('/api/v1/district/alerts').set(officer()).query({ schoolId: other.school.id }).expect(200);
      expect(bySchool.body.total).toBe(0);
    });

    it('reads the audit trail of its schools and officers', async () => {
      const res = await waitFor(async () => {
        const r = await api().get('/api/v1/district/audit').set(officer()).query({ pageSize: 100 }).expect(200);
        return r.body.items.some((i: any) => i.path === '/api/v1/school' && i.method === 'PATCH') && r.body.items.some((i: any) => i.path.includes('/district/rules')) ? r : null;
      });
      expect(res.body.items.find((i: any) => i.path === '/api/v1/school')).toMatchObject({ school: { code: `P5A${run}` } });
      expect(res.body.items.find((i: any) => i.path === '/api/v1/district/rules')).toMatchObject({ userRole: 'DISTRICT', districtId: district.district.id });
    });

    it('manages officer accounts', async () => {
      const list = await api().get('/api/v1/district/users').set(officer()).expect(200);
      expect(list.body).toHaveLength(1);
      const email = `cv2-${run}@test.vn`.toLowerCase();
      const created = await api().post('/api/v1/district/users').set(officer()).send({ email, fullName: 'Chuyên viên 2', password: 'District@123' }).expect(201);
      expect(created.body).toMatchObject({ email, mustChangePassword: true, isActive: true });
      const login = await api().post('/api/v1/auth/login').send({ email, password: 'District@123' }).expect(200);
      expect(login.body.user.district.id).toBe(district.district.id);
      await api().get('/api/v1/district/overview').set(bearer(login.body.accessToken)).expect(200);
      await api().post('/api/v1/district/users').set(officer()).send({ email, fullName: 'Trùng', password: 'District@123' }).expect(409);
      await api().patch(`/api/v1/district/users/${created.body.id}`).set(officer()).send({ isActive: false }).expect(200);
      await api().post('/api/v1/auth/login').send({ email, password: 'District@123' }).expect(401);
      await api().patch(`/api/v1/district/users/${district.user.id}`).set(officer()).send({ isActive: false }).expect(400);
    });
  });

  describe('MOET exchange', () => {
    let exportId: string;

    it('exports the student list in the MOET template', async () => {
      const res = await api().post('/api/v1/moet/exports').set(admin()).send({ kind: 'STUDENTS' }).expect(201);
      expect(res.body).toMatchObject({ kind: 'STUDENTS', status: 'DONE', rows: 4 });
      expect(res.body.fileName).toMatch(new RegExp(`^HocSinh_01-${run}_\\d{8}\\.csv$`));
      exportId = res.body.id;
      const file = await api().get(`/api/v1/moet/exports/${exportId}/download`).query({ access_token: tokens.STAFF }).expect(200);
      expect(file.headers['content-type']).toContain('text/csv');
      expect(file.headers['content-disposition']).toContain(res.body.fileName);
      const text = file.text ?? file.body.toString();
      expect(text.charCodeAt(0)).toBe(0xfeff);
      const lines = text.slice(1).trim().split('\r\n');
      expect(lines[0]).toBe('Mã trường;Mã học sinh;Họ và tên;Ngày sinh;Giới tính;Khối;Lớp;Trạng thái;Địa chỉ;Họ tên người giám hộ;Quan hệ;Điện thoại người giám hộ;Mã định danh;Dân tộc;Nơi sinh;Quê quán');
      expect(lines).toHaveLength(5);
      expect(lines[1]).toContain(`01-${run};${students[0].student.code};Nguyễn Văn An;;;6;6A;Đang học`);
      await api().get(`/api/v1/moet/exports/${exportId}/download`).set(bearer(other.tokens.ADMIN)).expect(404);
    });

    it('exports teachers, classes and term results and keeps the history', async () => {
      for (const kind of ['TEACHERS', 'CLASSES', 'TERM_RESULTS']) {
        const res = await api().post('/api/v1/moet/exports').set(staff()).send({ kind, semester: 1 }).expect(201);
        expect(res.body.status).toBe('DONE');
      }
      const classes = await api().get('/api/v1/moet/exports').set(admin()).query({ kind: 'CLASSES' }).expect(200);
      expect(classes.body.total).toBe(1);
      expect(classes.body.items[0].rows).toBe(1);
      const all = await api().get('/api/v1/moet/exports').set(admin()).expect(200);
      expect(all.body.total).toBe(4);
      await api().post('/api/v1/moet/exports').set(teacher()).send({ kind: 'STUDENTS' }).expect(403);
      await api().post('/api/v1/moet/exports').set(admin()).send({ kind: 'STUDENTS', academicYearId: 'nope' }).expect(404);
    });

    it('serves the import template and validates a dry run', async () => {
      const tpl = await api().get('/api/v1/moet/import/students/template').set(admin()).expect(200);
      expect(tpl.headers['content-type']).toContain('text/csv');
      expect(tpl.text).toContain('Mã học sinh');
      const csv =
        'Mã học sinh;Họ và tên;Ngày sinh;Giới tính;Lớp;Họ tên người giám hộ;Quan hệ;Điện thoại người giám hộ\r\n' +
        `${students[0].student.code};Nguyễn Văn An (sửa);05/10/2014;Nam;6A;;;\r\n` +
        `HSM${run};Hoàng Thị Mới;2014-12-01;Nữ;6A;Hoàng Văn Bố;Bố;0911222333\r\n` +
        `HSX${run};Lớp lạ;;;9Z;;;\r\n` +
        `HSE${run};Ngày hỏng;31/02/2014;;;;;\r\n`;
      const dry = await api().post('/api/v1/moet/import/students').set(admin()).send({ csv, dryRun: true }).expect(200);
      expect(dry.body).toMatchObject({ dryRun: true, total: 3, created: 2, updated: 1, enrolled: 2, guardians: 1, unknownClasses: ['9Z'] });
      expect(dry.body.errors).toEqual([{ line: 5, message: expect.stringContaining('Ngày sinh') }]);
      expect(await prisma.student.count({ where: { schoolId, code: `HSM${run}` } })).toBe(0);
    });

    it('upserts students, enrols them and adds guardians', async () => {
      const csv =
        'Mã học sinh;Họ và tên;Ngày sinh;Giới tính;Lớp;Họ tên người giám hộ;Quan hệ;Điện thoại người giám hộ\r\n' +
        `${students[0].student.code};Nguyễn Văn An (sửa);05/10/2014;Nam;6A;;;\r\n` +
        `HSM${run};Hoàng Thị Mới;2014-12-01;Nữ;6A;Hoàng Văn Bố;Bố;0911222333\r\n`;
      const res = await api().post('/api/v1/moet/import/students').set(staff()).send({ csv }).expect(200);
      expect(res.body).toMatchObject({ dryRun: false, total: 2, created: 1, updated: 1, enrolled: 2, guardians: 1, errors: [] });
      const updated = await prisma.student.findUniqueOrThrow({ where: { id: students[0].student.id } });
      expect(updated.fullName).toBe('Nguyễn Văn An (sửa)');
      expect(updated.dateOfBirth?.toISOString().slice(0, 10)).toBe('2014-10-05');
      const created = await prisma.student.findFirstOrThrow({ where: { schoolId, code: `HSM${run}` }, include: { guardians: true, enrollments: true } });
      expect(created).toMatchObject({ gender: 'FEMALE', status: 'STUDYING' });
      expect(created.enrollments[0].classId).toBe(classId);
      expect(created.guardians[0]).toMatchObject({ fullName: 'Hoàng Văn Bố', relationship: 'FATHER', phone: '0911222333', isPrimary: true });
      // Importing the same file again changes nothing and adds no second guardian.
      const again = await api().post('/api/v1/moet/import/students').set(staff()).send({ csv }).expect(200);
      expect(again.body).toMatchObject({ created: 0, updated: 2, guardians: 0 });
      expect(await prisma.guardian.count({ where: { studentId: created.id } })).toBe(1);
      await api().post('/api/v1/moet/import/students').set(admin()).send({ csv: 'a;b\r\n1;2' }).expect(200).then((r) => expect(r.body.errors[0].message).toContain('Thiếu cột'));
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Gender } from '@prisma/client';
import request from 'supertest';
import { bearer, createApp, createSchool, prisma, runId, waitFor } from './helpers';

// Đồng bộ CSDL ngành: submitting records straight to the ministry's or the Sở's database
// through the sandbox gateway, with the history of what it accepted and refused.
describe('Direct sync with the education database (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let firstId: string;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const account = { username: 'csdl_79000701', password: 'Mock@2026' };

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `MS${run}`);
    tokens = a.tokens;
    otherTokens = (await createSchool(app, `MT${run}`)).tokens;
    const schoolId = a.school.id;
    await prisma.school.update({ where: { id: schoolId }, data: { moetCode: '79000701' } });
    const yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const gv = await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', gender: Gender.FEMALE, dateOfBirth: new Date('1985-03-02') } });
    const classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6A', gradeLevel: 6, homeroomTeacherId: gv.id } })).id;
    await prisma.student.create({ data: { schoolId, code: 'HS1', fullName: 'Nguyễn Văn An', gender: Gender.MALE, dateOfBirth: new Date('2014-05-06'), enrollments: { create: { classId, academicYearId: yearId } } } });
    // No date of birth: the database refuses this record.
    await prisma.student.create({ data: { schoolId, code: 'HS2', fullName: 'Trần Thị Bình', gender: Gender.FEMALE, enrollments: { create: { classId, academicYearId: yearId } } } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('submits students and keeps the records the database refused', async () => {
    const res = await api().post('/api/v1/moet/sync').set(admin()).send({ target: 'MOET', kind: 'STUDENTS', ...account }).expect(201);
    expect(res.body).toMatchObject({ target: 'MOET', kind: 'STUDENTS', status: 'PARTIAL', total: 2, accepted: 1, rejected: 1, username: account.username, provider: 'mock-csdl', academicYear: '2026-2027', createdBy: 'ADMIN', error: null });
    expect(res.body.externalRef).toMatch(/^CSDL-\d{8}-[0-9A-F]{6}$/);
    expect(res.body.errors).toEqual([{ row: 2, code: 'HS2', name: 'Trần Thị Bình', message: 'Thiếu Ngày sinh' }]);
    expect(res.body).not.toHaveProperty('password');
    firstId = res.body.id;
  });

  it('records a refused sign-in or an unreachable service as a failed submission', async () => {
    const wrong = await api().post('/api/v1/moet/sync').set(staff()).send({ target: 'MOET', kind: 'TEACHERS', username: account.username, password: '123' }).expect(201);
    expect(wrong.body).toMatchObject({ status: 'FAILED', total: 1, accepted: 0, rejected: 0, externalRef: null, error: 'Sai tên đăng nhập hoặc mật khẩu tài khoản CSDL ngành', academicYear: null });
    const down = await api().post('/api/v1/moet/sync').set(staff()).send({ target: 'PROVINCE', kind: 'TEACHERS', username: 'so-mock-down', password: account.password }).expect(201);
    expect(down.body).toMatchObject({ status: 'FAILED', error: 'Hệ thống CSDL ngành đang bảo trì, vui lòng gửi lại sau' });
  });

  it('submits classes to the Sở in full', async () => {
    const res = await api().post('/api/v1/moet/sync').set(admin()).send({ target: 'PROVINCE', kind: 'CLASSES', username: 'so_hcm_79000701', password: account.password }).expect(201);
    expect(res.body).toMatchObject({ status: 'SUCCESS', total: 1, accepted: 1, rejected: 0, errors: [] });
    expect(res.body.externalRef).toMatch(/^SO-/);
  });

  it('refuses an empty submission and keeps others out', async () => {
    const empty = await api().post('/api/v1/moet/sync').set(admin()).send({ target: 'MOET', kind: 'TERM_RESULTS', semester: 1, ...account }).expect(400);
    expect(empty.body.message).toBe('Không có dữ liệu để gửi');
    await api().post('/api/v1/moet/sync').set(admin()).send({ target: 'MOET', kind: 'STUDENTS', username: account.username }).expect(400);
    await api().post('/api/v1/moet/sync').set(bearer(tokens.TEACHER)).send({ target: 'MOET', kind: 'STUDENTS', ...account }).expect(403);
    await api().get(`/api/v1/moet/sync/${firstId}`).set(bearer(otherTokens.ADMIN)).expect(404);
  });

  it('lists the history with the last account per database, never a password', async () => {
    const res = await api().get('/api/v1/moet/sync').set(staff()).expect(200);
    expect(res.body).toMatchObject({ total: 4, provider: 'mock-csdl', lastUsername: { MOET: account.username, PROVINCE: 'so_hcm_79000701' } });
    expect(res.body.items.map((i: any) => [i.target, i.kind, i.status])).toEqual([
      ['PROVINCE', 'CLASSES', 'SUCCESS'],
      ['PROVINCE', 'TEACHERS', 'FAILED'],
      ['MOET', 'TEACHERS', 'FAILED'],
      ['MOET', 'STUDENTS', 'PARTIAL'],
    ]);
    expect(res.body.items[0]).not.toHaveProperty('errors');
    const partial = await api().get('/api/v1/moet/sync').query({ status: 'PARTIAL' }).set(staff()).expect(200);
    expect(partial.body.total).toBe(1);
    const one = await api().get(`/api/v1/moet/sync/${firstId}`).set(staff()).expect(200);
    expect(one.body.errors).toHaveLength(1);
    // The audit log keeps the call with the password hidden.
    const logged = await waitFor(async () => {
      const r = await api().get('/api/v1/audit').set(admin()).query({ pageSize: 50 }).expect(200);
      return (r.body.items as any[]).find((i) => i.path === '/api/v1/moet/sync' && i.statusCode === 201 && i.body?.kind === 'STUDENTS');
    });
    expect(logged.body).toMatchObject({ username: account.username, password: '[đã ẩn]' });
  });
});

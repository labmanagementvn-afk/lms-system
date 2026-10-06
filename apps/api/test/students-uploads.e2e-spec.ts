import { INestApplication } from '@nestjs/common';
import AdmZip from 'adm-zip';
import request from 'supertest';
import { bearer, createApp, createClass, createSchool, createStudent, prisma, runId } from './helpers';

describe('Student accounts and uploads (e2e)', () => {
  let app: INestApplication;
  let schoolId: string;
  let admin: string;

  beforeAll(async () => {
    process.env.UPLOAD_DIR = `/tmp/lms-uploads-test-${runId()}`;
    app = await createApp();
    const s = await createSchool(app, `SA${runId()}`);
    schoolId = s.school.id;
    admin = s.tokens.ADMIN;
  });

  afterAll(() => app.close());

  it('creates a student login from the student record and signs in with the code', async () => {
    const cls = await createClass(schoolId, '6A1');
    const code = `HS${runId()}`;
    const student = await prisma.student.create({ data: { schoolId, code, fullName: 'Nguyễn Văn A', enrollments: { create: { classId: cls.id, academicYearId: cls.academicYearId } } } });

    const pending = await request(app.getHttpServer()).get('/api/v1/students/accounts/pending').set(bearer(admin)).expect(200);
    expect(pending.body.items.map((i: any) => i.id)).toContain(student.id);

    const created = await request(app.getHttpServer()).post('/api/v1/students/accounts').set(bearer(admin)).send({ studentId: student.id }).expect(201);
    expect(created.body.student.account.username).toBe(code.toLowerCase());
    expect(created.body.password).toHaveLength(8);

    await request(app.getHttpServer()).post('/api/v1/students/accounts').set(bearer(admin)).send({ studentId: student.id }).expect(409);

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: code.toUpperCase(), password: created.body.password }).expect(200);
    expect(login.body.user.role).toBe('STUDENT');
    expect(login.body.user.studentId).toBe(student.id);
    expect(login.body.user.mustChangePassword).toBe(true);

    const me = await request(app.getHttpServer()).get('/api/v1/student/me').set(bearer(login.body.accessToken)).expect(200);
    expect(me.body.class.name).toBe('6A1');

    // Students cannot reach portal routes; staff cannot reach the student app.
    await request(app.getHttpServer()).get('/api/v1/students').set(bearer(login.body.accessToken)).expect(403);
    await request(app.getHttpServer()).get('/api/v1/student/me').set(bearer(admin)).expect(403);
  });

  it('bulk-creates logins for a class and can lock and reset them', async () => {
    const cls = await createClass(schoolId, '6A2');
    for (let i = 0; i < 2; i++) {
      await prisma.student.create({ data: { schoolId, code: `HB${runId()}${i}`, fullName: `HS ${i}`, enrollments: { create: { classId: cls.id, academicYearId: cls.academicYearId } } } });
    }
    const bulk = await request(app.getHttpServer()).post('/api/v1/students/accounts/bulk').set(bearer(admin)).send({ classId: cls.id }).expect(201);
    expect(bulk.body.created).toHaveLength(2);
    expect(bulk.body.created[0].class).toBe('6A2');

    const list = await request(app.getHttpServer()).get('/api/v1/students/accounts').set(bearer(admin)).query({ classId: cls.id }).expect(200);
    expect(list.body.total).toBe(2);
    const userId = list.body.items[0].account.id;

    await request(app.getHttpServer()).patch(`/api/v1/students/accounts/${userId}`).set(bearer(admin)).send({ isActive: false }).expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: bulk.body.created[0].username, password: bulk.body.created[0].password })
      .expect(401);

    const reset = await request(app.getHttpServer()).post(`/api/v1/students/accounts/${userId}/reset-password`).set(bearer(admin)).expect(200);
    expect(reset.body.password).toHaveLength(8);
  });

  it('stores an upload and streams it back with a query token', async () => {
    const up = await request(app.getHttpServer()).post('/api/v1/uploads').set(bearer(admin)).attach('file', Buffer.from('hello lesson'), 'bai-1.txt').expect(201);
    expect(up.body.name).toBe('bai-1.txt');
    expect(up.body.size).toBe(12);

    const { token } = await createStudent(app, schoolId);
    const dl = await request(app.getHttpServer()).get(`/api/v1/uploads/${up.body.id}`).query({ access_token: token }).expect(200);
    expect(dl.text).toBe('hello lesson');
    expect(dl.headers['content-disposition']).toContain('bai-1.txt');

    // Another school cannot read it.
    const other = await createSchool(app, `SB${runId()}`);
    await request(app.getHttpServer()).get(`/api/v1/uploads/${up.body.id}`).set(bearer(other.tokens.ADMIN)).expect(404);

    await request(app.getHttpServer()).delete(`/api/v1/uploads/${up.body.id}`).set(bearer(admin)).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/uploads/${up.body.id}`).set(bearer(admin)).expect(404);
  });

  it('unpacks a SCORM package and serves its launch page without a token', async () => {
    const zip = new AdmZip();
    zip.addFile(
      'pkg/imsmanifest.xml',
      Buffer.from(
        '<manifest><organizations><organization><item identifier="i1" identifierref="r1"/></organization></organizations><resources><resource identifier="r1" href="index.html"/></resources></manifest>',
      ),
    );
    zip.addFile('pkg/index.html', Buffer.from('<html><body>SCO</body></html>'));
    zip.addFile('pkg/js/app.js', Buffer.from('console.log(1)'));
    zip.addFile('pkg/../evil.txt', Buffer.from('nope'));

    const up = await request(app.getHttpServer()).post('/api/v1/uploads/scorm').set(bearer(admin)).attach('file', zip.toBuffer(), 'course.zip').expect(201);
    expect(up.body.launchPath).toBe('index.html');

    const page = await request(app.getHttpServer()).get(`/api/v1/uploads/scorm/${up.body.id}/index.html`).expect(200);
    expect(page.text).toContain('SCO');
    await request(app.getHttpServer()).get(`/api/v1/uploads/scorm/${up.body.id}/js/app.js`).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/uploads/scorm/${up.body.id}/../evil.txt`).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/uploads/scorm/${up.body.id}/missing.html`).expect(404);

    await request(app.getHttpServer()).post('/api/v1/uploads/scorm').set(bearer(admin)).attach('file', Buffer.from('not a zip'), 'x.zip').expect(400);
  });
});

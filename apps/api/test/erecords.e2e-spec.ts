import { INestApplication } from '@nestjs/common';
import { Gender, ResultLevel } from '@prisma/client';
import request from 'supertest';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// Học bạ số: transcripts frozen as records, signed by the homeroom teacher and then the
// principal through the sandbox signing providers, verified, revoked and reissued.
describe('Signed digital transcripts (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let classId: string; // 9A, homeroom = the TEACHER user
  let otherClassId: string; // 9B, homeroom = a teacher without an account
  let an: string;
  let binh: string;
  let ids: Record<string, string>; // student id -> record id
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `ER${run}`);
    tokens = a.tokens;
    otherTokens = (await createSchool(app, `ES${run}`)).tokens;
    const schoolId = a.school.id;
    await prisma.school.update({ where: { id: schoolId }, data: { governingBody: 'UBND phường Nghĩa Đô', principalName: 'Nguyễn Thị Hồng Hạnh', locality: 'Hà Nội' } });
    const yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-er${run}@test.vn`.toLowerCase() } });
    await prisma.user.update({ where: { id: teacherUser.id }, data: { fullName: 'Phạm Quốc Bảo' } });
    const gv = await prisma.teacher.create({ data: { schoolId, code: 'GV4', fullName: 'Phạm Quốc Bảo', userId: teacherUser.id } });
    const gv2 = await prisma.teacher.create({ data: { schoolId, code: 'GV5', fullName: 'Hoàng Minh Tuấn' } });
    await prisma.user.update({ where: { email: `admin-er${run}@test.vn`.toLowerCase() }, data: { fullName: 'Nguyễn Thị Hồng Hạnh' } });
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '9A', gradeLevel: 9, homeroomTeacherId: gv.id } })).id;
    otherClassId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '9B', gradeLevel: 9, homeroomTeacherId: gv2.id } })).id;
    const student = async (code: string, fullName: string, results: boolean) => {
      const s = await prisma.student.create({ data: { schoolId, code, fullName, gender: Gender.MALE, dateOfBirth: new Date('2012-04-05'), enrollments: { create: { classId, academicYearId: yearId } } } });
      if (results) {
        await prisma.termResult.create({ data: { schoolId, academicYearId: yearId, semester: 0, classId, studentId: s.id, academic: ResultLevel.KHA, conduct: ResultLevel.TOT, absentDays: 2, homeroomComment: 'Chăm ngoan, tiến bộ.' } });
      }
      return s.id;
    };
    an = await student('HS1', 'Nguyễn Văn An', true);
    binh = await student('HS2', 'Trần Văn Bình', true);
    await student('HS3', 'Lê Minh Châu', false);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers each signer’s remote signing account and looks up its certificate', async () => {
    const empty = await api().get('/api/v1/esign/profile').set(teacher()).expect(200);
    expect(empty.body.profile).toBeNull();
    expect(empty.body.providers.map((p: any) => [p.provider, p.label, p.sandbox])).toEqual([
      ['VNPT_SMARTCA', 'VNPT SmartCA', true],
      ['VIETTEL_MYSIGN', 'Viettel MySign', true],
    ]);
    const nocert = await api().put('/api/v1/esign/profile').set(teacher()).send({ provider: 'VNPT_SMARTCA', account: 'mock-nocert' }).expect(400);
    expect(nocert.body.message).toBe('Tài khoản mock-nocert chưa được cấp chứng thư số VNPT SmartCA');
    const t = await api().put('/api/v1/esign/profile').set(teacher()).send({ provider: 'VNPT_SMARTCA', account: '079085001234' }).expect(200);
    expect(t.body.profile).toMatchObject({ provider: 'VNPT_SMARTCA', providerLabel: 'VNPT SmartCA', account: '079085001234', certSubject: 'CN=Phạm Quốc Bảo, UID=CCCD:079085001234, C=VN', valid: true });
    await api().put('/api/v1/esign/profile').set(admin()).send({ provider: 'VIETTEL_MYSIGN', account: '0912345678' }).expect(200);
  });

  it('lists a class for its homeroom teacher and the office only', async () => {
    const res = await api().get('/api/v1/erecords').query({ classId }).set(teacher()).expect(200);
    expect(res.body).toMatchObject({ class: { name: '9A', academicYear: { name: '2026-2027' }, homeroomTeacher: { fullName: 'Phạm Quốc Bảo' } }, canSign: { homeroom: true, principal: false }, counts: { NONE: 3 } });
    expect(res.body.students.map((s: any) => [s.fullName, s.hasResults, s.record])).toEqual([
      ['Lê Minh Châu', false, null],
      ['Nguyễn Văn An', true, null],
      ['Trần Văn Bình', true, null],
    ]);
    await api().get('/api/v1/erecords').query({ classId: otherClassId }).set(teacher()).expect(403);
    expect((await api().get('/api/v1/erecords').query({ classId }).set(admin()).expect(200)).body.canSign).toEqual({ homeroom: false, principal: true });
    await api().get('/api/v1/erecords').query({ classId }).set(bearer(otherTokens.ADMIN)).expect(404);
  });

  it('freezes the transcripts of students who have their year results', async () => {
    const res = await api().post('/api/v1/erecords/generate').set(teacher()).send({ classId }).expect(201);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped.map((s: any) => [s.name, s.reason])).toEqual([['Lê Minh Châu', 'Chưa có kết quả học tập cả năm']]);
    const again = await api().post('/api/v1/erecords/generate').set(staff()).send({ classId }).expect(201);
    expect(again.body.created).toBe(0);
    expect(again.body.skipped.map((s: any) => s.reason)).toEqual(['Chưa có kết quả học tập cả năm', 'Đã có học bạ số', 'Đã có học bạ số']);
    const list = await api().get('/api/v1/erecords').query({ classId }).set(teacher()).expect(200);
    ids = Object.fromEntries(list.body.students.filter((s: any) => s.record).map((s: any) => [s.id, s.record.id]));
    expect(list.body.counts).toMatchObject({ NONE: 1, DRAFT: 2 });
    const detail = await api().get(`/api/v1/erecords/${ids[an]}`).set(teacher()).expect(200);
    expect(detail.body).toMatchObject({ version: 1, status: 'DRAFT', student: { fullName: 'Nguyễn Văn An' }, check: { contentIntact: true, valid: false, signatures: [] } });
    expect(detail.body.content.document).toMatchObject({ title: 'Kết quả học tập và rèn luyện', signer: { title: 'Hiệu trưởng', name: 'Nguyễn Thị Hồng Hạnh' }, cosigner: { title: 'Giáo viên chủ nhiệm', name: 'Phạm Quốc Bảo' } });
    expect(detail.body.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('is signed by the homeroom teacher first, then by the principal, which issues it', async () => {
    const early = await api().post('/api/v1/erecords/sign').set(admin()).send({ ids: [ids[an]] }).expect(200);
    expect(early.body).toEqual({ signed: 0, failed: [{ id: ids[an], name: 'Nguyễn Văn An', error: 'Giáo viên chủ nhiệm lớp 9A ký trước' }] });
    const noProfile = await api().post('/api/v1/erecords/sign').set(staff()).send({ ids: [ids[an]] }).expect(400);
    expect(noProfile.body.message).toBe('Bạn chưa khai báo tài khoản ký số (Tài khoản › Chữ ký số)');
    const gvcn = await api().post('/api/v1/erecords/sign').set(teacher()).send({ ids: [ids[an], ids[binh], 'nope'] }).expect(200);
    expect(gvcn.body).toEqual({ signed: 2, failed: [{ id: 'nope', name: '', error: 'Không tìm thấy học bạ' }] });
    const twice = await api().post('/api/v1/erecords/sign').set(teacher()).send({ ids: [ids[an]] }).expect(200);
    expect(twice.body.failed[0].error).toBe('Đang chờ Hiệu trưởng ký');
    const principal = await api().post('/api/v1/erecords/sign').set(admin()).send({ ids: [ids[an], ids[binh]] }).expect(200);
    expect(principal.body).toEqual({ signed: 2, failed: [] });
    const done = await api().post('/api/v1/erecords/sign').set(admin()).send({ ids: [ids[an]] }).expect(200);
    expect(done.body.failed[0].error).toBe('Học bạ đã được phát hành');

    const detail = await api().get(`/api/v1/erecords/${ids[an]}`).set(staff()).expect(200);
    expect(detail.body.status).toBe('ISSUED');
    expect(detail.body.issuedAt).toBe(detail.body.signatures[1].signedAt);
    expect(detail.body.check).toMatchObject({ contentIntact: true, sandbox: true, valid: true });
    expect(detail.body.check.signatures.map((s: any) => [s.role, s.name, s.providerLabel, s.valid, s.certValid])).toEqual([
      ['HOMEROOM', 'Phạm Quốc Bảo', 'VNPT SmartCA', true, true],
      ['PRINCIPAL', 'Nguyễn Thị Hồng Hạnh', 'Viettel MySign', true, true],
    ]);
  });

  it('prints the record with its signature stamps', async () => {
    const pdf = await api().get(`/api/v1/erecords/${ids[an]}/pdf`).query({ access_token: tokens.TEACHER }).buffer(true).parse(binary).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(/hoc-ba-so-hs1-2026-2027-v1\.pdf/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('lets anyone holding the paper verify it, and notices a changed content', async () => {
    const detail = await api().get(`/api/v1/erecords/${ids[binh]}`).set(staff()).expect(200);
    const pub = await api().get(`/api/v1/public/erecords/${ids[binh]}`).query({ code: detail.body.code.toLowerCase() }).expect(200);
    expect(pub.body).toMatchObject({ status: 'ISSUED', valid: true, sandbox: true, student: { fullName: 'Trần Văn Bình', dateOfBirth: '05/04/2012' }, className: '9A', academicYear: '2026-2027' });
    expect(pub.body.signatures.map((s: any) => [s.title, s.name, s.valid])).toEqual([
      ['Giáo viên chủ nhiệm', 'Phạm Quốc Bảo', true],
      ['Hiệu trưởng', 'Nguyễn Thị Hồng Hạnh', true],
    ]);
    expect(pub.body).not.toHaveProperty('content');
    await api().get(`/api/v1/public/erecords/${ids[binh]}`).query({ code: '0000-0000-0000' }).expect(404);
    // Someone edits the stored transcript behind the system's back.
    const content = detail.body.content;
    content.document.blocks[0].fields[0][1] = 'Trần Văn Bính';
    await prisma.eRecord.update({ where: { id: ids[binh] }, data: { content } });
    const tampered = await api().get(`/api/v1/public/erecords/${ids[binh]}`).query({ code: detail.body.code }).expect(200);
    expect(tampered.body).toMatchObject({ valid: false, contentIntact: false });
  });

  it('is revoked by the principal and replaced by a new version', async () => {
    await api().post(`/api/v1/erecords/${ids[binh]}/revoke`).set(teacher()).send({ reason: 'Sai tên' }).expect(403);
    const revoked = await api().post(`/api/v1/erecords/${ids[binh]}/revoke`).set(admin()).send({ reason: 'Sai họ tên, đã sửa' }).expect(200);
    expect(revoked.body).toMatchObject({ status: 'REVOKED', revokedReason: 'Sai họ tên, đã sửa', check: { valid: false } });
    await api().post(`/api/v1/erecords/${ids[binh]}/revoke`).set(admin()).send({ reason: 'Lần nữa' }).expect(400);
    const signRevoked = await api().post('/api/v1/erecords/sign').set(teacher()).send({ ids: [ids[binh]] }).expect(200);
    expect(signRevoked.body.failed[0].error).toBe('Học bạ đã bị thu hồi');
    const again = await api().post('/api/v1/erecords/generate').set(teacher()).send({ classId, studentIds: [binh] }).expect(201);
    expect(again.body).toEqual({ created: 1, skipped: [] });
    const list = await api().get('/api/v1/erecords').query({ classId }).set(teacher()).expect(200);
    const row = list.body.students.find((s: any) => s.id === binh);
    expect(row).toMatchObject({ versions: 2, record: { version: 2, status: 'DRAFT' } });
    const v2 = await api().get(`/api/v1/erecords/${row.record.id}`).set(teacher()).expect(200);
    expect(v2.body.versions.map((v: any) => [v.version, v.status])).toEqual([
      [2, 'DRAFT'],
      [1, 'REVOKED'],
    ]);
    expect(v2.body.content.document.blocks[0].fields[0][1]).toBe('Trần Văn Bình');
    await api().post('/api/v1/erecords/generate').set(teacher()).send({ classId, studentIds: ['nope'] }).expect(400);
  });
});

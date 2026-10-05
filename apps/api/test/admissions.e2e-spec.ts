import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createParent, createSchool, prisma, runId, uniquePhone } from './helpers';

// Admissions: public form -> screening -> enrolment, CSV import/export, and the
// start-of-year service registration (parent submits, office confirms).
describe('Admissions (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let schoolCode: string;
  let otherCode: string;
  let classId: string;
  let existingStudentId: string;
  let parent: Awaited<ReturnType<typeof createParent>>;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const staff = () => bearer(tokens.STAFF);

  // School-local dates relative to today.
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + offsetDays * 86_400_000));

  let roundId: string;
  let appId: string;
  let appCode: string;
  let newStudentId: string;

  beforeAll(async () => {
    app = await createApp();
    schoolCode = `TS${run}`;
    otherCode = `TT${run}`;
    const a = await createSchool(app, schoolCode);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, otherCode)).tokens;

    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId } });
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: year.id, name: '6A1', gradeLevel: 6 } })).id;
    existingStudentId = (
      await prisma.student.create({
        data: { schoolId, code: 'HS2026001', fullName: 'Lê Văn Cũ', enrollments: { create: { classId, academicYearId: year.id } } },
      })
    ).id;
    // A parent who already has an account; the new application reuses their phone.
    parent = await createParent(app, schoolId, [existingStudentId], 'Nguyễn Văn Bình');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('rounds', () => {
    it('is for the office only', async () => {
      await api().get('/api/v1/admissions/rounds').set(bearer(tokens.TEACHER)).expect(403);
      await api().get('/api/v1/admissions/rounds').set(bearer(parent.token)).expect(403);
    });

    it('creates, edits, closes and deletes rounds', async () => {
      const res = await api()
        .post('/api/v1/admissions/rounds')
        .set(staff())
        .send({ name: 'Tuyển sinh lớp 6 năm học 2027-2028', gradeLevel: 6, startDate: vnDate(-1), endDate: vnDate(30), capacity: 2 })
        .expect(201);
      roundId = res.body.id;
      expect(res.body).toMatchObject({ status: 'OPEN', capacity: 2, academicYear: { name: '2026-2027' } });
      await api().post('/api/v1/admissions/rounds').set(staff()).send({ name: 'Tuyển sinh lớp 6 năm học 2027-2028', gradeLevel: 6, startDate: vnDate(0), endDate: vnDate(1) }).expect(409);
      await api().post('/api/v1/admissions/rounds').set(staff()).send({ name: 'Ngược ngày', gradeLevel: 6, startDate: vnDate(5), endDate: vnDate(1) }).expect(400);

      const old = (
        await api().post('/api/v1/admissions/rounds').set(staff()).send({ name: 'Đợt cũ', gradeLevel: 6, startDate: '2025-04-01', endDate: '2025-06-30' }).expect(201)
      ).body;
      await api().patch(`/api/v1/admissions/rounds/${old.id}`).set(staff()).send({ description: 'Đã kết thúc' }).expect(200);
      const closed = await api().post(`/api/v1/admissions/rounds/${old.id}/close`).set(staff()).expect(200);
      expect(closed.body.status).toBe('CLOSED');
      await api().post(`/api/v1/admissions/rounds/${old.id}/close`).set(staff()).expect(400);

      const list = await api().get('/api/v1/admissions/rounds').set(staff()).expect(200);
      expect(list.body).toHaveLength(2);
      const open = list.body.find((r: any) => r.id === roundId);
      expect(open).toMatchObject({ total: 0, acceptedCount: 0, acceptingNow: true, counts: { SUBMITTED: 0, ENROLLED: 0 } });
      expect(list.body.find((r: any) => r.id === old.id).acceptingNow).toBe(false);

      await api().delete(`/api/v1/admissions/rounds/${old.id}`).set(staff()).expect(200);
      expect((await api().get('/api/v1/admissions/rounds').set(staff()).expect(200)).body).toHaveLength(1);
    });
  });

  describe('public form', () => {
    it('shows the school and the rounds accepting applications', async () => {
      const res = await api().get(`/api/v1/public/admissions/${schoolCode}`).expect(200);
      expect(res.body.school).toEqual({ name: `Trường ${schoolCode}`, code: schoolCode, address: null });
      expect(res.body.rounds.map((r: any) => r.id)).toEqual([roundId]);
      await api().get('/api/v1/public/admissions/KHONG-CO').expect(404);
    });

    it('accepts an application once', async () => {
      const body = {
        roundId,
        fullName: '  Nguyễn  Văn An ',
        gender: 'MALE',
        dateOfBirth: '2015-09-01',
        address: 'Cầu Giấy, Hà Nội',
        previousSchool: 'Tiểu học Kim Đồng',
        guardianName: 'Nguyễn Văn Bình',
        guardianPhone: parent.phone,
        guardianRelationship: 'FATHER',
      };
      const res = await api().post(`/api/v1/public/admissions/${schoolCode}/applications`).send(body).expect(201);
      expect(res.body).toEqual({ code: expect.stringMatching(/^TS\d{2}-\d{5}$/), fullName: 'Nguyễn Văn An', round: { name: 'Tuyển sinh lớp 6 năm học 2027-2028' } });
      appCode = res.body.code;

      const dup = await api().post(`/api/v1/public/admissions/${schoolCode}/applications`).send(body).expect(409);
      expect(dup.body.message).toBe('Hồ sơ này đã được nộp');
      // Same child with the phone written differently is still the same application.
      await api()
        .post(`/api/v1/public/admissions/${schoolCode}/applications`)
        .send({ ...body, guardianPhone: `+84 ${parent.phone.slice(1, 4)} ${parent.phone.slice(4)}` })
        .expect(409);
      await api().post(`/api/v1/public/admissions/${schoolCode}/applications`).send({ ...body, guardianPhone: '12' }).expect(400);
      await api().post(`/api/v1/public/admissions/${schoolCode}/applications`).send({ ...body, extra: 'x' }).expect(400);
    });

    it('refuses rounds outside their dates', async () => {
      const past = (
        await api().post('/api/v1/admissions/rounds').set(staff()).send({ name: 'Đợt đã qua', gradeLevel: 6, startDate: vnDate(-40), endDate: vnDate(-10) }).expect(201)
      ).body;
      const res = await api()
        .post(`/api/v1/public/admissions/${schoolCode}/applications`)
        .send({ roundId: past.id, fullName: 'Trễ Hạn', dateOfBirth: '2015-01-01', guardianName: 'PH', guardianPhone: uniquePhone() })
        .expect(400);
      expect(res.body.message).toContain('Ngoài thời gian');
      await api().delete(`/api/v1/admissions/rounds/${past.id}`).set(staff()).expect(200);
    });

    it('looks up the status with the guardian phone', async () => {
      const res = await api().get(`/api/v1/public/admissions/${schoolCode}/applications/${appCode}`).query({ phone: parent.phone }).expect(200);
      expect(res.body).toMatchObject({ code: appCode, fullName: 'Nguyễn Văn An', status: 'SUBMITTED', round: { name: 'Tuyển sinh lớp 6 năm học 2027-2028', gradeLevel: 6 }, class: null });
      await api().get(`/api/v1/public/admissions/${schoolCode}/applications/${appCode}`).query({ phone: '0900000000' }).expect(404);
      await api().get(`/api/v1/public/admissions/${schoolCode}/applications/${appCode}`).expect(400);
    });
  });

  describe('screening and enrolment', () => {
    it('lists and searches applications', async () => {
      const list = await api().get('/api/v1/admissions/applications').query({ roundId }).set(staff()).expect(200);
      expect(list.body.total).toBe(1);
      appId = list.body.items[0].id;
      expect(list.body.items[0]).toMatchObject({ code: appCode, source: 'ONLINE', guardianPhone: parent.phone, round: { name: 'Tuyển sinh lớp 6 năm học 2027-2028' } });
      expect((await api().get('/api/v1/admissions/applications').query({ q: 'văn an' }).set(staff()).expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/admissions/applications').query({ q: parent.phone.slice(0, 6) }).set(staff()).expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/admissions/applications').query({ q: 'không có' }).set(staff()).expect(200)).body.total).toBe(0);
      await api().get(`/api/v1/admissions/applications/${appId}`).set(staff()).expect(200);
    });

    it('adds manual applications and records screening', async () => {
      const res = await api()
        .post('/api/v1/admissions/applications')
        .set(staff())
        .send({ roundId, fullName: 'Trần Thị Bích', gender: 'FEMALE', dateOfBirth: '2015-02-10', guardianName: 'Trần Văn Cường', guardianPhone: uniquePhone() })
        .expect(201);
      expect(res.body).toMatchObject({ source: 'MANUAL', status: 'SUBMITTED', guardianRelationship: 'GUARDIAN' });
      const upd = await api().patch(`/api/v1/admissions/applications/${appId}`).set(staff()).send({ score: 8.5, screeningNote: 'Phỏng vấn tốt' }).expect(200);
      expect(upd.body).toMatchObject({ score: 8.5, screeningNote: 'Phỏng vấn tốt' });
    });

    it('only allows the defined status moves', async () => {
      const bad = await api().post(`/api/v1/admissions/applications/${appId}/status`).set(staff()).send({ status: 'ACCEPTED' }).expect(400);
      expect(bad.body.message).toContain('Không thể chuyển');
      await api().post(`/api/v1/admissions/applications/${appId}/status`).set(staff()).send({ status: 'ENROLLED' }).expect(400);
      await api().post(`/api/v1/admissions/applications/${appId}/enrol`).set(staff()).send({ classId }).expect(400);

      const screening = await api().post(`/api/v1/admissions/applications/${appId}/status`).set(staff()).send({ status: 'SCREENING' }).expect(200);
      expect(screening.body.status).toBe('SCREENING');
      const accepted = await api().post(`/api/v1/admissions/applications/${appId}/status`).set(staff()).send({ status: 'ACCEPTED', note: 'Đạt' }).expect(200);
      expect(accepted.body).toMatchObject({ status: 'ACCEPTED', screeningNote: 'Đạt' });
    });

    it('enrols: student, guardian linked to the parent account, enrolment', async () => {
      await api().post(`/api/v1/admissions/applications/${appId}/enrol`).set(staff()).send({ classId: 'nope' }).expect(400);
      const res = await api().post(`/api/v1/admissions/applications/${appId}/enrol`).set(staff()).send({ classId }).expect(200);
      expect(res.body).toMatchObject({ status: 'ENROLLED', class: { id: classId, name: '6A1' }, student: { code: 'HS2026002' } });
      newStudentId = res.body.studentId;

      const student = await prisma.student.findUniqueOrThrow({ where: { id: newStudentId }, include: { guardians: true, enrollments: true } });
      expect(student).toMatchObject({ schoolId, code: 'HS2026002', fullName: 'Nguyễn Văn An', gender: 'MALE', address: 'Cầu Giấy, Hà Nội', status: 'STUDYING' });
      expect(student.dateOfBirth?.toISOString().slice(0, 10)).toBe('2015-09-01');
      expect(student.guardians).toHaveLength(1);
      expect(student.guardians[0]).toMatchObject({ fullName: 'Nguyễn Văn Bình', relationship: 'FATHER', phone: parent.phone, isPrimary: true, userId: parent.user.id });
      expect(student.enrollments).toHaveLength(1);
      expect(student.enrollments[0].classId).toBe(classId);

      // The parent app now shows the new child.
      const children = await api().get('/api/v1/parent/children').set(bearer(parent.token)).expect(200);
      expect(children.body.map((c: any) => c.id).sort()).toEqual([existingStudentId, newStudentId].sort());

      await api().post(`/api/v1/admissions/applications/${appId}/enrol`).set(staff()).send({ classId }).expect(400);
      await api().patch(`/api/v1/admissions/applications/${appId}`).set(staff()).send({ score: 9 }).expect(400);
    });

    it('bulk-enrols and reports per application', async () => {
      const second = (await api().get('/api/v1/admissions/applications').query({ roundId, status: 'SUBMITTED' }).set(staff()).expect(200)).body.items[0];
      await api().post(`/api/v1/admissions/applications/${second.id}/status`).set(staff()).send({ status: 'SCREENING' }).expect(200);
      await api().post(`/api/v1/admissions/applications/${second.id}/status`).set(staff()).send({ status: 'ACCEPTED' }).expect(200);
      const res = await api().post('/api/v1/admissions/applications/bulk-enrol').set(staff()).send({ ids: [second.id, appId], classId }).expect(200);
      expect(res.body).toMatchObject({ enrolled: 1, failed: 1 });
      expect(res.body.results).toEqual([
        { id: second.id, ok: true, code: second.code, studentCode: 'HS2026003' },
        { id: appId, ok: false, error: 'Chỉ nhập học được hồ sơ đã trúng tuyển' },
      ]);

      const rounds = await api().get('/api/v1/admissions/rounds').set(staff()).expect(200);
      expect(rounds.body[0]).toMatchObject({ capacity: 2, acceptedCount: 2, total: 2, counts: { ENROLLED: 2 } });
    });
  });

  describe('CSV import and export', () => {
    const csv = [
      'Họ tên;Giới tính;Ngày sinh;Địa chỉ;Trường cũ;Người giám hộ;SĐT;Email;Quan hệ;Ghi chú',
      'Phạm Gia Huy;Nam;12/03/2015;;TH Dịch Vọng;Phạm Văn Long;0912 000 111;long@example.com;Cha;',
      '"Lê, Thu Hà";Nữ;2015-07-20;Hà Nội;;Lê Thị Mai;0912000222;;Mẹ;"Ghi chú có ""ngoặc"""',
      `Nguyễn Văn An;Nam;01/09/2015;;;Nguyễn Văn Bình;${'0'};;;`,
      'Sai Ngày;Nam;31/02/2015;;;PH;0912000333;;;',
    ].join('\r\n');

    it('imports rows, skipping duplicates and reporting bad rows', async () => {
      const text = csv.replace(';0;;;', `;${parent.phone};;;`);
      const res = await api().post('/api/v1/admissions/applications/import').set(staff()).send({ roundId, csv: `﻿${text}` }).expect(200);
      expect(res.body).toEqual({ created: 2, skipped: 1, errors: [{ row: 5, message: 'Ngày sinh không hợp lệ (dd/mm/yyyy)' }] });

      const list = await api().get('/api/v1/admissions/applications').query({ roundId, source: 'IMPORT' }).set(staff()).expect(200);
      expect(list.body.total).toBe(2);
      const ha = list.body.items.find((a: any) => a.fullName === 'Lê, Thu Hà');
      expect(ha).toMatchObject({ gender: 'FEMALE', guardianPhone: '0912000222', guardianRelationship: 'MOTHER', notes: 'Ghi chú có "ngoặc"', address: 'Hà Nội' });
      expect(ha.dateOfBirth.slice(0, 10)).toBe('2015-07-20');
      const huy = list.body.items.find((a: any) => a.fullName === 'Phạm Gia Huy');
      expect(huy).toMatchObject({ guardianPhone: '0912000111', guardianEmail: 'long@example.com', guardianRelationship: 'FATHER', previousSchool: 'TH Dịch Vọng' });

      // Re-importing the same file creates nothing.
      const again = await api().post('/api/v1/admissions/applications/import').set(staff()).send({ roundId, csv: text }).expect(200);
      expect(again.body).toMatchObject({ created: 0, skipped: 3 });

      const missing = await api().post('/api/v1/admissions/applications/import').set(staff()).send({ roundId, csv: 'Họ tên,Ghi chú\nA,B\n' }).expect(400);
      expect(missing.body.message).toBe('Thiếu cột: Ngày sinh, Người giám hộ, SĐT');
    });

    it('exports a CSV with a BOM', async () => {
      const res = await api().get('/api/v1/admissions/applications/export').query({ roundId }).set(staff()).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.startsWith('﻿')).toBe(true);
      // trim() would also strip the BOM, so drop it explicitly.
      const lines = res.text.slice(1).trim().split('\r\n');
      expect(lines[0]).toBe('Họ tên,Giới tính,Ngày sinh,Địa chỉ,Trường cũ,Người giám hộ,SĐT,Email,Quan hệ,Ghi chú,Mã hồ sơ,Trạng thái,Nguồn,Điểm,Ghi chú xét tuyển,Lớp,Mã học sinh,Đợt tuyển sinh,Ngày nộp');
      expect(lines).toHaveLength(5);
      expect(lines.find((l) => l.startsWith('Nguyễn Văn An'))).toContain(`,${appCode},Đã nhập học,Trực tuyến,8.5,Đạt,6A1,HS2026002,`);
      expect(res.text).toContain('"Lê, Thu Hà",Nữ,20/07/2015');
    });
  });

  describe('service registration', () => {
    let registrationId: string;
    const body = { canteen: true, bus: true, busStopNote: 'Ngã tư Láng Hạ', uniform: { shirtSize: 'M', pantsSize: 'L', quantity: 2 }, extras: ['CLB bóng đá', 'CLB tiếng Anh'], note: 'Con dị ứng tôm' };

    it('lets a parent submit for their child', async () => {
      const empty = await api().get(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).expect(200);
      expect(empty.body).toEqual({ academicYear: { id: expect.any(String), name: '2026-2027' }, registration: null });
      await api().get(`/api/v1/parent/children/${existingStudentId}/services`).set(staff()).expect(403);

      const res = await api().put(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).send(body).expect(200);
      expect(res.body).toMatchObject({ ...body, status: 'SUBMITTED', submittedByUserId: parent.user.id });
      registrationId = res.body.id;
      await api().put(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).send({ ...body, uniform: { shirtSize: 'XS' } }).expect(400);

      // Resubmitting updates the same row; the new child counts as theirs too.
      const again = await api().put(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).send({ ...body, bus: false }).expect(200);
      expect(again.body).toMatchObject({ id: registrationId, bus: false, busStopNote: null });
      const kid = await api().put(`/api/v1/parent/children/${newStudentId}/services`).set(bearer(parent.token)).send({ canteen: false, bus: false }).expect(200);
      expect(kid.body).toMatchObject({ canteen: false, uniform: null, extras: null });
      expect((await api().get(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).expect(200)).body.registration.id).toBe(registrationId);
    });

    it('gives the office a list, a summary, edits and confirmation', async () => {
      await api().get('/api/v1/admissions/services').set(bearer(tokens.TEACHER)).expect(403);
      const list = await api().get('/api/v1/admissions/services').query({ classId }).set(staff()).expect(200);
      expect(list.body.total).toBe(3);
      expect(list.body.items.map((i: any) => [i.student.code, i.registration?.status ?? null])).toEqual([
        ['HS2026001', 'SUBMITTED'],
        ['HS2026002', 'SUBMITTED'],
        ['HS2026003', null],
      ]);
      expect(list.body.items[0].student.class.name).toBe('6A1');
      expect((await api().get('/api/v1/admissions/services').query({ status: 'NONE' }).set(staff()).expect(200)).body.items.map((i: any) => i.student.code)).toEqual(['HS2026003']);

      const summary = await api().get('/api/v1/admissions/services/summary').query({ classId }).set(staff()).expect(200);
      expect(summary.body).toMatchObject({
        students: 3,
        registered: 2,
        submitted: 2,
        confirmed: 0,
        canteen: 1,
        bus: 0,
        uniform: { count: 1, quantity: 2, bySize: { S: 0, M: 1, L: 0, XL: 0, XXL: 0 }, pantsBySize: { L: 1 } },
        extras: { 'CLB bóng đá': 1, 'CLB tiếng Anh': 1 },
      });

      // Staff edit keeps the status; confirming locks it for the parent.
      const edited = await api().put(`/api/v1/admissions/services/student/${existingStudentId}`).set(staff()).send({ ...body, extras: ['CLB mỹ thuật'] }).expect(200);
      expect(edited.body).toMatchObject({ id: registrationId, status: 'SUBMITTED', bus: true, extras: ['CLB mỹ thuật'] });
      const confirmed = await api().post(`/api/v1/admissions/services/${registrationId}/confirm`).set(staff()).expect(200);
      expect(confirmed.body.status).toBe('CONFIRMED');
      const locked = await api().put(`/api/v1/parent/children/${existingStudentId}/services`).set(bearer(parent.token)).send(body).expect(400);
      expect(locked.body.message).toBe('Đăng ký đã được nhà trường xác nhận, liên hệ văn phòng để thay đổi');
      expect((await api().get('/api/v1/admissions/services').query({ status: 'CONFIRMED' }).set(staff()).expect(200)).body.total).toBe(1);

      const csv = await api().get('/api/v1/admissions/services/export').query({ classId }).set(staff()).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.startsWith('﻿')).toBe(true);
      const lines = csv.text.slice(1).trim().split('\r\n');
      expect(lines[0]).toBe('Mã HS,Họ tên,Lớp,Bán trú,Xe đưa đón,Điểm đón,Size áo,Size quần,Số bộ,Dịch vụ khác,Ghi chú,Trạng thái');
      expect(lines[1]).toBe('HS2026001,Lê Văn Cũ,6A1,Có,Có,Ngã tư Láng Hạ,M,L,2,CLB mỹ thuật,Con dị ứng tôm,Đã xác nhận');
      expect(lines[3]).toBe('HS2026003,Trần Thị Bích,6A1,,,,,,,,,Chưa đăng ký');
    });
  });

  describe('school isolation', () => {
    it('hides one school from another', async () => {
      const other = bearer(otherTokens.ADMIN);
      expect((await api().get('/api/v1/admissions/rounds').set(other).expect(200)).body).toEqual([]);
      expect((await api().get('/api/v1/admissions/applications').set(other).expect(200)).body.total).toBe(0);
      await api().get(`/api/v1/admissions/applications/${appId}`).set(other).expect(404);
      await api().patch(`/api/v1/admissions/rounds/${roundId}`).set(other).send({ capacity: 5 }).expect(404);
      await api().post(`/api/v1/admissions/rounds/${roundId}/close`).set(other).expect(404);
      const res = await api()
        .post('/api/v1/admissions/applications')
        .set(other)
        .send({ roundId, fullName: 'Trường Khác', dateOfBirth: '2015-01-01', guardianName: 'PH', guardianPhone: uniquePhone() })
        .expect(400);
      expect(res.body.message).toBe('Đợt tuyển sinh không hợp lệ');
      await api().put(`/api/v1/admissions/services/student/${existingStudentId}`).set(other).send({ canteen: true, bus: false }).expect(404);
      expect((await api().get(`/api/v1/public/admissions/${otherCode}`).expect(200)).body.rounds).toEqual([]);
      await api().get(`/api/v1/public/admissions/${otherCode}/applications/${appCode}`).query({ phone: parent.phone }).expect(404);
    });
  });
});

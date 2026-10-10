import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createParent, createSchool, createStudent, prisma, runId, uniquePhone } from './helpers';

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

// Hồ sơ học sinh: the profile, movements, commendation and discipline (Thông tư 19/2025) and leave requests.
describe('Student records (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let yearId: string;
  let class7A: string; // homeroom = the TEACHER user
  let class7B: string; // homeroom = a teacher without an account
  let class8A: string;
  let class3A: string;
  let an: string;
  let binh: Awaited<ReturnType<typeof createStudent>>;
  let chau: string;
  let dung: string;
  let em: string;
  let huy: string;
  let subjectId: string;
  let parent: Awaited<ReturnType<typeof createParent>>;
  let stranger: Awaited<ReturnType<typeof createParent>>;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  const TZ = 'Asia/Ho_Chi_Minh';
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + offsetDays * 86_400_000));
  const today = vnDate(0);

  const notifications = async (token: string, kind: string) => {
    const res = await api().get('/api/v1/notifications').query({ kind, pageSize: 50 }).set(bearer(token)).expect(200);
    return res.body.items as any[];
  };
  const report = async (key: string, query: Record<string, unknown>, auth = admin()) => (await api().get(`/api/v1/reports/${key}`).query(query).set(auth).expect(200)).body.document;
  const cells = (doc: any) => doc.blocks.filter((b: any) => b.type === 'table')[0].rows as any[][];
  const lines = (doc: any) => doc.blocks.filter((b: any) => b.type === 'text').flatMap((b: any) => b.lines) as string[];

  beforeAll(async () => {
    app = await createApp();
    const s = await createSchool(app, `SR${run}`);
    tokens = s.tokens;
    schoolId = s.school.id;
    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-sr${run}@test.vn`.toLowerCase() } });
    const gv1 = await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUser.id } });
    const gv2 = await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng' } });
    const klass = (name: string, gradeLevel: number, homeroomTeacherId?: string) => prisma.class.create({ data: { schoolId, academicYearId: yearId, name, gradeLevel, homeroomTeacherId } });
    class7A = (await klass('7A', 7, gv1.id)).id;
    class7B = (await klass('7B', 7, gv2.id)).id;
    class8A = (await klass('8A', 8)).id;
    class3A = (await klass('3A', 3)).id;
    const student = async (code: string, fullName: string, classId: string) =>
      (await prisma.student.create({ data: { schoolId, code: `${code}${run}`, fullName, enrollments: { create: { classId, academicYearId: yearId } } } })).id;
    an = await student('AN', 'Nguyễn Văn An', class7A);
    binh = await createStudent(app, schoolId, { classId: class7A, fullName: 'Trần Thị Bình' });
    chau = await student('CH', 'Lê Minh Châu', class7A);
    dung = await student('DU', 'Phạm Quốc Dũng', class7B);
    em = await student('EM', 'Võ Thị Em', class3A);
    parent = await createParent(app, schoolId, [an], 'Nguyễn Thị Hoa');
    stranger = await createParent(app, schoolId, [dung], 'Phạm Văn Tư');
    subjectId = (await prisma.subject.create({ data: { schoolId, code: 'TOAN', name: 'Toán' } })).id;
    await prisma.score.create({ data: { schoolId, academicYearId: yearId, semester: 1, classId: class7A, studentId: chau, subjectId, kind: 'TX', index: 1, value: 8 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('the record', () => {
    it('creates a student who transferred in, with the profile and the parents', async () => {
      const body = {
        code: `HUY${run}`,
        fullName: 'Hoàng Gia Huy',
        gender: 'MALE',
        dateOfBirth: '2013-04-02',
        classId: class7A,
        address: '12 Hàng Bài',
        currentWard: 'Phường Hoàn Kiếm',
        currentProvince: 'Hà Nội',
        idNumber: '001213004321',
        ethnicity: 'Kinh',
        birthPlace: 'Hà Nội',
        hometown: 'Nam Định',
        policyGroups: ['POOR_HOUSEHOLD'],
        youngPioneer: true,
        guardians: [{ fullName: 'Hoàng Văn Nam', relationship: 'FATHER', phone: uniquePhone(), birthYear: 1983, occupation: 'Kỹ sư', isPrimary: true }],
        entryKind: 'TRANSFER_IN',
        entryDate: '2026-09-20',
      };
      await api().post('/api/v1/students').set(admin()).send(body).expect(400);
      await api().post('/api/v1/students').set(admin()).send({ ...body, previousSchool: 'Trường THCS Trưng Vương', idNumber: '123' }).expect(400);
      const res = await api().post('/api/v1/students').set(admin()).send({ ...body, previousSchool: 'Trường THCS Trưng Vương' }).expect(201);
      huy = res.body.id;
      expect(res.body).toMatchObject({ idNumber: '001213004321', ethnicity: 'Kinh', policyGroups: ['POOR_HOUSEHOLD'], youngPioneer: true, nationality: 'Việt Nam' });

      const list = await api().get('/api/v1/students').query({ policyGroup: 'POOR_HOUSEHOLD' }).set(teacher()).expect(200);
      expect(list.body.items.map((s: any) => s.id)).toEqual([huy]);

      const profile = await api().get(`/api/v1/students/${huy}/profile`).set(teacher()).expect(200);
      expect(profile.body.class).toMatchObject({ name: '7A', academicYear: { name: '2026-2027' } });
      expect(profile.body.student.guardians[0]).toMatchObject({ fullName: 'Hoàng Văn Nam', birthYear: 1983, occupation: 'Kỹ sư' });
      expect(profile.body.movements).toEqual([expect.objectContaining({ kind: 'TRANSFER_IN', date: '2026-09-20', otherSchool: 'Trường THCS Trưng Vương', toClass: expect.objectContaining({ name: '7A' }) })]);
      expect(profile.body.years).toEqual([expect.objectContaining({ academicYear: expect.objectContaining({ isCurrent: true }), class: expect.objectContaining({ name: '7A' }) })]);
    });

    it('keeps the parent account when the guardians are edited', async () => {
      const before = await api().get(`/api/v1/students/${an}`).set(admin()).expect(200);
      const mother = before.body.guardians[0];
      expect(mother.userId).toBe(parent.user.id);
      const father = { fullName: 'Nguyễn Văn Ba', relationship: 'FATHER', phone: uniquePhone() };
      await api()
        .patch(`/api/v1/students/${an}`)
        .set(staff())
        .send({ guardians: [{ id: mother.id, fullName: mother.fullName, relationship: 'MOTHER', phone: mother.phone, occupation: 'Giáo viên', isPrimary: true }, father] })
        .expect(200);
      const kept = await prisma.guardian.findUniqueOrThrow({ where: { id: mother.id } });
      expect(kept).toMatchObject({ userId: parent.user.id, occupation: 'Giáo viên' });
      expect(await prisma.guardian.count({ where: { studentId: an } })).toBe(2);
      const children = await api().get('/api/v1/parent/children').set(bearer(parent.token)).expect(200);
      expect(children.body.map((c: any) => c.id)).toContain(an);

      const other = await prisma.guardian.findFirstOrThrow({ where: { studentId: dung } });
      await api().patch(`/api/v1/students/${an}`).set(staff()).send({ guardians: [{ id: other.id, fullName: 'X', relationship: 'OTHER', phone: other.phone }] }).expect(400);
      const status = await api().patch(`/api/v1/students/${an}`).set(staff()).send({ status: 'TRANSFERRED' }).expect(400);
      expect(status.body.message).toContain('Chuyển trường');
    });
  });

  describe('movements', () => {
    it('moves a student to another class of the grade with the marks of the year', async () => {
      await api().post('/api/v1/students/move-class').set(teacher()).send({ studentIds: [chau], toClassId: class7B }).expect(403);
      const wrong = await api().post('/api/v1/students/move-class').set(staff()).send({ studentIds: [chau], toClassId: class8A }).expect(400);
      expect(wrong.body.message).toContain('cùng khối');
      const res = await api().post('/api/v1/students/move-class').set(staff()).send({ studentIds: [chau], toClassId: class7B, date: '2026-10-07', reason: 'Theo nguyện vọng gia đình' }).expect(200);
      expect(res.body).toMatchObject({ moved: 1, placed: 0, unchanged: 0, class: { name: '7B' } });
      expect((await prisma.score.findFirstOrThrow({ where: { studentId: chau } })).classId).toBe(class7B);
      expect((await prisma.enrollment.findFirstOrThrow({ where: { studentId: chau, academicYearId: yearId } })).classId).toBe(class7B);
      const again = await api().post('/api/v1/students/move-class').set(staff()).send({ studentIds: [chau], toClassId: class7B }).expect(200);
      expect(again.body).toMatchObject({ moved: 0, unchanged: 1 });
    });

    it('transfers a student out, stops the login and prints the transfer letter', async () => {
      const pending = await prisma.absenceRequest.create({
        data: { schoolId, studentId: binh.student.id, classId: class7A, fromDate: new Date(`${vnDate(2)}T00:00:00Z`), toDate: new Date(`${vnDate(2)}T00:00:00Z`), reason: 'Việc gia đình', requestedById: binh.user.id },
      });
      await api().post('/api/v1/students/transfer-out').set(staff()).send({ studentIds: [binh.student.id] }).expect(400);
      const res = await api()
        .post('/api/v1/students/transfer-out')
        .set(staff())
        .send({ studentIds: [binh.student.id], otherSchool: 'Trường THCS Lê Quý Đôn, TP. Hồ Chí Minh', reason: 'Gia đình chuyển nơi ở', documentNo: '12/GGT-THCS', date: '2026-10-05' })
        .expect(200);
      expect(res.body).toEqual({ count: 1, status: 'TRANSFERRED' });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: binh.user.id } })).isActive).toBe(false);
      expect((await prisma.absenceRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
      await api().post('/api/v1/auth/login').send({ username: binh.user.username, password: 'Secret@123' }).expect(401);
      const twice = await api().post('/api/v1/students/transfer-out').set(staff()).send({ studentIds: [binh.student.id], otherSchool: 'X' }).expect(400);
      expect(twice.body.message).toContain('không còn đang học');

      const letter = await report('transfer-letter', { studentId: binh.student.id });
      expect(letter).toMatchObject({ title: 'Giấy giới thiệu chuyển trường', number: 'Số: 12/GGT-THCS' });
      expect(lines(letter).join('\n')).toContain('được chuyển đến học tại Trường THCS Lê Quý Đôn, TP. Hồ Chí Minh từ ngày 05/10/2026');
      expect(lines(letter)).toContain('Lý do chuyển trường: Gia đình chuyển nơi ở.');
      const pdf = await api().get('/api/v1/reports/transfer-letter').query({ studentId: binh.student.id, format: 'pdf' }).set(staff()).buffer(true).parse(binary).expect(200);
      expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
      await api().get('/api/v1/reports/transfer-letter').query({ studentId: binh.student.id }).set(teacher()).expect(403);
      await api().get('/api/v1/reports/transfer-letter').query({ studentId: an }).set(admin()).expect(400);

      const byStatus = await report('students-by-status', { status: 'TRANSFERRED' });
      expect(cells(byStatus)[0]).toEqual([1, binh.student.code, 'Trần Thị Bình', '', '', '7A', '05/10/2026', 'Trường THCS Lê Quý Đôn, TP. Hồ Chí Minh']);
    });

    it('drops a student out and takes them back', async () => {
      await api().post('/api/v1/students/drop-out').set(staff()).send({ studentIds: [dung] }).expect(400);
      await api().post('/api/v1/students/drop-out').set(staff()).send({ studentIds: [dung], reason: 'Hoàn cảnh gia đình khó khăn', date: '2026-10-06' }).expect(200);
      expect((await prisma.student.findUniqueOrThrow({ where: { id: dung } })).status).toBe('DROPPED');
      await api().post(`/api/v1/students/${an}/readmit`).set(staff()).send({ classId: class7A }).expect(400);
      await api().post(`/api/v1/students/${dung}/readmit`).set(teacher()).send({ classId: class7B }).expect(403);
      const back = await api().post(`/api/v1/students/${dung}/readmit`).set(staff()).send({ classId: class7B, date: '2026-10-08', reason: 'Gia đình xin cho con đi học lại' }).expect(200);
      expect(back.body).toEqual({ id: dung, status: 'STUDYING' });

      const list = await api().get('/api/v1/students/movements').query({ from: '2026-09-01', to: '2026-10-31' }).set(teacher()).expect(200);
      expect(list.body.map((m: any) => m.kind).sort()).toEqual(['CLASS_CHANGE', 'DROPPED', 'RETURNED', 'TRANSFER_IN', 'TRANSFER_OUT']);
      const ofDung = await api().get('/api/v1/students/movements').query({ studentId: dung }).set(teacher()).expect(200);
      expect(ofDung.body.map((m: any) => [m.kind, m.date])).toEqual([
        ['RETURNED', '2026-10-08'],
        ['DROPPED', '2026-10-06'],
      ]);
    });

    it('prints the movements and the sổ đăng bộ', async () => {
      const doc = await report('student-movements', { from: '2026-09-01', to: '2026-10-31' });
      expect(cells(doc).map((r) => [r[1], r[3], r[5]])).toEqual([
        ['20/09/2026', 'Hoàng Gia Huy', 'Chuyển đến'],
        ['05/10/2026', 'Trần Thị Bình', 'Chuyển đi'],
        ['06/10/2026', 'Phạm Quốc Dũng', 'Thôi học'],
        ['07/10/2026', 'Lê Minh Châu', 'Chuyển lớp'],
        ['08/10/2026', 'Phạm Quốc Dũng', 'Trở lại học'],
      ]);
      expect(lines(doc)[0]).toBe('Sĩ số tăng 2 (tuyển mới, chuyển đến, trở lại học), giảm 2 (chuyển đi, thôi học); chuyển lớp trong trường: 1.');
      const grade8 = await report('student-movements', { from: '2026-09-01', to: '2026-10-31', gradeLevel: 8 });
      expect(cells(grade8)).toEqual([]);

      const book = await report('student-register', { gradeLevel: 7 });
      const row = (name: string) => cells(book).find((r) => r[1] === name)!;
      expect(row('Hoàng Gia Huy').slice(4, 15)).toEqual(['Hà Nội', 'Kinh', 'Nam Định', '12 Hàng Bài, Phường Hoàn Kiếm, Hà Nội', 'Hoàng Văn Nam, Kỹ sư', '', '7A', '20/09/2026', 'Chuyển đến từ Trường THCS Trưng Vương', '', '']);
      expect(row('Trần Thị Bình').slice(13)).toEqual(['05/10/2026', 'Chuyển đến Trường THCS Lê Quý Đôn, TP. Hồ Chí Minh']);
      expect(row('Phạm Quốc Dũng').slice(13)).toEqual(['', '']);
      expect(row('Nguyễn Văn An')[9]).toBe('Nguyễn Thị Hoa, Giáo viên');
      expect(cells(book)).toHaveLength(5);

      const policy = await report('policy-students', {});
      expect(cells(policy)).toEqual([[1, '7A', 'Hoàng Gia Huy', '02/04/2013', 'Nam', 'Kinh', 'Hộ nghèo', '12 Hàng Bài, Phường Hoàn Kiếm, Hà Nội']]);
    });
  });

  describe('commendation and discipline', () => {
    it('lets teachers praise before the class and the school give the rest (Điều 6 to 10)', async () => {
      await api().post('/api/v1/students/awards').set(teacher()).send({ studentIds: [an], form: 'PRINCIPAL_CERTIFICATE', content: 'Đạt giải Nhất cuộc thi vẽ' }).expect(403);
      await api().post('/api/v1/students/awards').set(teacher()).send({ studentIds: [an], form: 'CLASS_PRAISE', content: 'Nhặt được của rơi trả người đánh mất', date: '2026-10-08' }).expect(201);
      const res = await api().post('/api/v1/students/awards').set(staff()).send({ studentIds: [an, huy], form: 'SCHOOL_PRAISE', content: 'Đạt giải Nhất hội khỏe Phù Đổng cấp phường', date: '2026-10-09', decisionNo: '45/QĐ-THCS' }).expect(201);
      expect(res.body).toEqual({ count: 2 });
      await api().post('/api/v1/students/awards').set(staff()).send({ studentIds: [binh.student.id], form: 'SCHOOL_PRAISE', content: 'x' }).expect(400);

      const told = await notifications(parent.token, 'STUDENT_AWARD');
      expect(told).toHaveLength(2);
      expect(told.map((n) => n.body)).toContain('Nguyễn Văn An được tuyên dương trước lớp ngày 08/10/2026: Nhặt được của rơi trả người đánh mất.');
      const list = await api().get('/api/v1/students/awards').query({ studentId: an }).set(teacher()).expect(200);
      expect(list.body.map((a: any) => [a.label, a.class.name])).toEqual([
        ['Tuyên dương trước toàn trường', '7A'],
        ['Tuyên dương trước lớp', '7A'],
      ]);
      const doc = await report('student-awards', { from: '2026-10-01', to: '2026-10-31' }, teacher());
      expect(cells(doc)).toHaveLength(3);
      expect(cells(doc)[0].slice(2)).toEqual(['Nguyễn Văn An', '7A', 'Tuyên dương trước lớp', 'Nhặt được của rơi trả người đánh mất', '', 'TEACHER']);
    });

    it('takes discipline measures in the order of Điều 13 to 17', async () => {
      const post = (auth: Record<string, string>, body: Record<string, unknown>) => api().post('/api/v1/students/discipline').set(auth).send({ date: '2026-10-09', violation: 'Nói chuyện riêng trong giờ học', ...body });
      // Châu is in 7B now: the TEACHER user may only remind.
      await post(teacher(), { studentIds: [chau], measure: 'REMINDER', severity: 1 }).expect(201);
      const notHomeroom = await post(teacher(), { studentIds: [chau], measure: 'CRITICISM', severity: 2 }).expect(403);
      expect(notHomeroom.body.message).toContain('Điều 17');
      // An is in the TEACHER's homeroom class.
      const early = await post(teacher(), { studentIds: [an], measure: 'CRITICISM', severity: 1 }).expect(400);
      expect(early.body.message).toContain('Phê bình');
      await post(teacher(), { studentIds: [an], measure: 'REMINDER', severity: 1 }).expect(201);
      await post(teacher(), { studentIds: [an], measure: 'CRITICISM', severity: 1 }).expect(201);
      await post(teacher(), { studentIds: [an], measure: 'SELF_REVIEW', severity: 1 }).expect(400);
      await post(teacher(), { studentIds: [an], measure: 'SELF_REVIEW', severity: 2, violation: 'Đánh nhau với bạn cùng lớp', support: 'Gặp gỡ, tư vấn tâm lý cùng gia đình' }).expect(201);
      await post(teacher(), { studentIds: [an], measure: 'APOLOGY', severity: 2 }).expect(400);
      // Primary pupils: a reminder or an apology only.
      const primary = await post(admin(), { studentIds: [em], measure: 'CRITICISM', severity: 3 }).expect(400);
      expect(primary.body.message).toContain('tiểu học');
      await post(admin(), { studentIds: [em], measure: 'APOLOGY', severity: 1 }).expect(400);
      await post(admin(), { studentIds: [em], measure: 'REMINDER', severity: 1 }).expect(201);
      await post(admin(), { studentIds: [em], measure: 'APOLOGY', severity: 1 }).expect(201);

      const told = await notifications(parent.token, 'STUDENT_DISCIPLINE');
      expect(told).toHaveLength(3);
      expect(told.find((n) => n.body.includes('tự kiểm điểm')).body).toContain('Gia đình vui lòng xem bản tự kiểm điểm của con, xác nhận');

      const doc = await report('student-discipline', { from: '2026-10-01', to: '2026-10-31' });
      expect(cells(doc)).toHaveLength(6);
      expect(cells(doc).find((r) => r[6] === 'Yêu cầu viết bản tự kiểm điểm')!.slice(2)).toEqual(['Nguyễn Văn An', '7A', 'Đánh nhau với bạn cùng lớp', 2, 'Yêu cầu viết bản tự kiểm điểm', 'Gặp gỡ, tư vấn tâm lý cùng gia đình', 'Chưa', 'TEACHER']);
      await api().get('/api/v1/reports/student-discipline').query({ from: '2026-10-01', to: '2026-10-31' }).set(teacher()).expect(403);
    });

    it('shows the family the record and lets them confirm the self-review', async () => {
      const merits = await api().get(`/api/v1/parent/children/${an}/merits`).set(bearer(parent.token)).expect(200);
      expect(merits.body.student).toMatchObject({ id: an, class: { name: '7A' } });
      expect(merits.body.awards).toHaveLength(2);
      expect(merits.body.discipline.map((d: any) => d.measure).sort()).toEqual(['CRITICISM', 'REMINDER', 'SELF_REVIEW']);
      const review = merits.body.discipline.find((d: any) => d.measure === 'SELF_REVIEW');
      const reminder = merits.body.discipline.find((d: any) => d.measure === 'REMINDER');
      expect(review.familyConfirmedAt).toBeNull();
      await api().get(`/api/v1/parent/children/${an}/merits`).set(bearer(stranger.token)).expect(404);
      await api().post(`/api/v1/parent/discipline/${review.id}/confirm`).set(bearer(stranger.token)).expect(404);
      await api().post(`/api/v1/parent/discipline/${reminder.id}/confirm`).set(bearer(parent.token)).expect(404);
      await api().post(`/api/v1/parent/discipline/${review.id}/confirm`).set(bearer(parent.token)).expect(200);
      const after = await api().get(`/api/v1/parent/children/${an}/merits`).set(bearer(parent.token)).expect(200);
      expect(after.body.discipline.find((d: any) => d.id === review.id).familyConfirmedAt).toBe(today);

      // Support activities: the principal or the homeroom teacher.
      const ofChau = (await prisma.studentDiscipline.findFirstOrThrow({ where: { studentId: chau } })).id;
      await api().patch(`/api/v1/students/discipline/${ofChau}`).set(teacher()).send({ support: 'Trao đổi với gia đình' }).expect(403);
      const updated = await api().patch(`/api/v1/students/discipline/${ofChau}`).set(admin()).send({ support: 'Trao đổi với gia đình' }).expect(200);
      expect(updated.body).toMatchObject({ support: 'Trao đổi với gia đình', label: 'Nhắc nhở', student: { id: chau } });
      await api().patch(`/api/v1/students/discipline/${ofChau}`).set(admin()).send({ familyConfirmed: true }).expect(400);
      // Whoever recorded it may take it back.
      const ofEm = (await prisma.studentDiscipline.findFirstOrThrow({ where: { studentId: em } })).id;
      await api().delete(`/api/v1/students/discipline/${ofEm}`).set(teacher()).expect(403);
      await api().delete(`/api/v1/students/discipline/${ofChau}`).set(teacher()).expect(200);
    });
  });

  describe('leave requests', () => {
    const ask = (body: Record<string, unknown>, token = parent.token, student = an) => api().post(`/api/v1/parent/children/${student}/absences`).set(bearer(token)).send({ reason: 'Con bị sốt', ...body });
    let requestId: string;

    it('lets a parent ask for days off and tells the homeroom teacher', async () => {
      const res = await ask({ fromDate: today, toDate: vnDate(1) }).expect(201);
      requestId = res.body.id;
      expect(res.body).toMatchObject({ status: 'PENDING', fromDate: today, toDate: vnDate(1), session: null, class: { name: '7A' }, requestedBy: { fullName: 'Nguyễn Thị Hoa' } });
      const told = await notifications(tokens.TEACHER, 'ABSENCE_REQUEST');
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({ title: 'Đơn xin nghỉ học lớp 7A', studentId: an });
      expect(told[0].body).toContain('Lý do: Con bị sốt');

      expect((await ask({ fromDate: vnDate(1), toDate: vnDate(1), session: 'MORNING' }).expect(400)).body.message).toContain('Đã có đơn xin nghỉ');
      await ask({ fromDate: vnDate(4), toDate: vnDate(4), session: 'AFTERNOON' }).expect(201);
      await ask({ fromDate: vnDate(4), toDate: vnDate(4), session: 'MORNING' }).expect(201);
      await ask({ fromDate: vnDate(4), toDate: vnDate(4) }).expect(400);
      await ask({ fromDate: vnDate(-10), toDate: vnDate(-9) }).expect(400);
      await ask({ fromDate: vnDate(3), toDate: vnDate(2) }).expect(400);
      await ask({ fromDate: vnDate(10), toDate: vnDate(45) }).expect(400);
      await ask({ fromDate: vnDate(6), toDate: vnDate(6) }, stranger.token).expect(404);
      const mine = await api().get(`/api/v1/parent/children/${an}/absences`).set(bearer(parent.token)).expect(200);
      expect(mine.body.requests).toHaveLength(3);
    });

    it('shows the request on the roll call and spares the parent the absence alert', async () => {
      const sheet = await api().get('/api/v1/homeroom/attendance').query({ classId: class7A, date: today }).set(teacher()).expect(200);
      const row = sheet.body.rows.find((r: any) => r.student.id === an);
      expect(row.leave).toMatchObject({ id: requestId, status: 'PENDING', reason: 'Con bị sốt' });
      expect(sheet.body.rows.find((r: any) => r.student.id === huy).leave).toBeNull();
      await api()
        .put('/api/v1/homeroom/attendance')
        .set(teacher())
        .send({ classId: class7A, date: today, records: [{ studentId: an, status: 'ABSENT' }, { studentId: huy, status: 'PRESENT' }] })
        .expect(200);
      expect(await notifications(parent.token, 'HOMEROOM_ABSENT')).toHaveLength(0);
    });

    it('has the homeroom teacher decide, and excuses the days already marked', async () => {
      // Waiting requests first; the transferred student's was cancelled.
      const list = await api().get('/api/v1/homeroom/absences').set(teacher()).expect(200);
      expect(list.body.map((r: any) => r.status)).toEqual(['PENDING', 'PENDING', 'PENDING', 'CANCELLED']);
      expect(list.body.map((r: any) => r.id)).toContain(requestId);
      const res = await api().post(`/api/v1/homeroom/absences/${requestId}/decide`).set(teacher()).send({ approve: true, note: 'Chúc con mau khỏe' }).expect(200);
      expect(res.body).toMatchObject({ status: 'APPROVED', excused: 1, decidedBy: { role: 'TEACHER' }, decisionNote: 'Chúc con mau khỏe' });
      const mark = await prisma.homeroomAttendance.findFirstOrThrow({ where: { studentId: an, classId: class7A, date: new Date(`${today}T00:00:00Z`) } });
      expect(mark).toMatchObject({ status: 'EXCUSED', note: 'Có đơn xin nghỉ: Con bị sốt' });
      const told = await notifications(parent.token, 'ABSENCE_DECIDED');
      expect(told[0].body).toContain('đã được giáo viên chủ nhiệm duyệt. Ghi chú: Chúc con mau khỏe');
      expect((await api().post(`/api/v1/homeroom/absences/${requestId}/decide`).set(teacher()).send({ approve: false }).expect(400)).body.message).toContain('đã được xử lý');

      await api().post(`/api/v1/parent/absences/${requestId}/cancel`).set(bearer(parent.token)).expect(400);
      const afternoon = (await prisma.absenceRequest.findFirstOrThrow({ where: { studentId: an, session: 'AFTERNOON' } })).id;
      await api().post(`/api/v1/parent/absences/${afternoon}/cancel`).set(bearer(stranger.token)).expect(404);
      expect((await api().post(`/api/v1/parent/absences/${afternoon}/cancel`).set(bearer(parent.token)).expect(200)).body.status).toBe('CANCELLED');
      const morning = (await prisma.absenceRequest.findFirstOrThrow({ where: { studentId: an, session: 'MORNING' } })).id;
      const declined = await api().post(`/api/v1/homeroom/absences/${morning}/decide`).set(admin()).send({ approve: false, note: 'Đề nghị gia đình cho con đi học' }).expect(200);
      expect(declined.body).toMatchObject({ status: 'REJECTED', excused: 0 });
    });

    it('lets the school write down a request made by phone, and the prefill excuses it', async () => {
      const yesterday = vnDate(-1);
      await api().post('/api/v1/homeroom/absences').set(teacher()).send({ studentId: dung, fromDate: yesterday, toDate: yesterday, reason: 'Phụ huynh gọi điện báo con ốm' }).expect(403);
      const res = await api().post('/api/v1/homeroom/absences').set(staff()).send({ studentId: dung, fromDate: yesterday, toDate: yesterday, reason: 'Phụ huynh gọi điện báo con ốm' }).expect(201);
      expect(res.body).toMatchObject({ status: 'APPROVED', excused: 0, class: { name: '7B' } });
      await api().post(`/api/v1/homeroom/absences/${res.body.id}/decide`).set(teacher()).send({ approve: true }).expect(403);
      expect((await notifications(stranger.token, 'ABSENCE_DECIDED'))[0].body).toContain('Nhà trường đã ghi nhận đơn xin nghỉ học của Phạm Quốc Dũng');

      const filled = await api().post('/api/v1/homeroom/attendance/prefill').set(staff()).send({ classId: class7B, date: yesterday }).expect(200);
      const status = (id: string) => filled.body.rows.find((r: any) => r.student.id === id);
      expect(status(dung)).toMatchObject({ status: 'EXCUSED', note: 'Có đơn xin nghỉ: Phụ huynh gọi điện báo con ốm', leave: { status: 'APPROVED' } });
      expect(status(chau)).toMatchObject({ status: 'ABSENT', leave: null });
      expect(await notifications(stranger.token, 'HOMEROOM_ABSENT')).toHaveLength(0);

      // Teachers see the requests of their homeroom classes only.
      const mine = await api().get('/api/v1/homeroom/absences').set(teacher()).expect(200);
      expect(mine.body.every((r: any) => r.class.name === '7A')).toBe(true);
      await api().get('/api/v1/homeroom/absences').query({ classId: class7B }).set(teacher()).expect(403);
      const office = await api().get('/api/v1/homeroom/absences').query({ status: 'APPROVED' }).set(staff()).expect(200);
      expect(office.body.map((r: any) => r.student.fullName).sort()).toEqual(['Nguyễn Văn An', 'Phạm Quốc Dũng']);
    });

    it('moves the requests still to come with the student', async () => {
      const later = await ask({ fromDate: vnDate(8), toDate: vnDate(9) }).expect(201);
      await api().post('/api/v1/students/move-class').set(staff()).send({ studentIds: [an], toClassId: class7B }).expect(200);
      expect((await prisma.absenceRequest.findUniqueOrThrow({ where: { id: later.body.id } })).classId).toBe(class7B);
      expect((await prisma.absenceRequest.findUniqueOrThrow({ where: { id: requestId } })).classId).toBe(class7B);
      const profile = await api().get(`/api/v1/students/${an}/profile`).set(admin()).expect(200);
      expect(profile.body.attendance).toMatchObject({ excused: 1, absent: 0 });
      expect(profile.body.absenceRequests).toHaveLength(4);
      expect(profile.body.awards).toHaveLength(2);
      expect(profile.body.discipline).toHaveLength(3);
    });
  });
});

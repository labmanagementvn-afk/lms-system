import { INestApplication } from '@nestjs/common';
import { Gender, GuardianRelationship, Role, Session, TeacherStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { NOT_ASSIGNED_MESSAGE } from '../src/grades/control.service';
import { HOMEROOM_ONLY } from '../src/homeroom/homeroom-access.service';
import { BOOK_WRITE_ONLY } from '../src/homeroom/homeroom-book.service';
import { bearer, createApp, createParent, createSchool, createStudent, prisma, runId } from './helpers';

// Phase 10: phân công giảng dạy and chủ nhiệm, chức vụ and kiêm nhiệm with the định mức
// tiết dạy of Thông tư 05/2025/TT-BGDĐT, the lịch báo giảng and the sổ chủ nhiệm.
describe('Teaching assignments, workload, lịch báo giảng and sổ chủ nhiệm (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let gv1: string; // Nguyễn Thị Lan: the TEACHER login, homeroom teacher of 6A, teaches Toán
  let gv2: string; // Trần Văn Hùng: a second teacher login, homeroom teacher of 6B, teaches Ngữ văn
  let gv3: string; // Lê Thu Hà: no login, teaches Tiếng Anh
  let gvLeft: string; // resigned
  let class6A: string;
  let class6B: string;
  let class7A: string;
  let toan: string;
  let van: string;
  let anh: string;
  let a1: Awaited<ReturnType<typeof createStudent>>;
  let a2: Awaited<ReturnType<typeof createStudent>>;
  let a3: Awaited<ReturnType<typeof createStudent>>;
  let b1: Awaited<ReturnType<typeof createStudent>>;
  let guardianA1: string;
  let guardianA2: string;
  let guardianB1: string;
  let gv2Token: string;
  let admin2Token: string;
  let parent: Awaited<ReturnType<typeof createParent>>;
  const types: Record<string, string> = {};
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);
  const teacher2 = () => bearer(gv2Token);

  const TZ = 'Asia/Ho_Chi_Minh';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const marks = (auth: Record<string, string>, subjectId: string, value = 7) =>
    api().put('/api/v1/grades/book').set(auth).send({ classId: class6A, subjectId, semester: 1, entries: [{ studentId: a1.student.id, kind: 'TX', index: 1, value }] });
  const workload = async (semester: number) => (await api().get('/api/v1/teaching/workload').query({ semester }).set(admin()).expect(200)).body;
  const rowOf = (w: any, teacherId: string) => w.rows.find((r: any) => r.teacher.id === teacherId);
  const book = async (auth = teacher()) => (await api().get('/api/v1/homeroom/book').query({ classId: class6A }).set(auth).expect(200)).body;
  const saveBook = (body: Record<string, unknown>, auth = teacher()) => api().put('/api/v1/homeroom/book').set(auth).send({ classId: class6A, ...body });
  const login = async (email: string, fullName: string, role: Role) => {
    await prisma.user.create({ data: { schoolId, email, fullName, role, passwordHash: await bcrypt.hash('Secret@123', 4) } });
    return (await api().post('/api/v1/auth/login').send({ email, password: 'Secret@123' }).expect(200)).body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createApp();
    const s = await createSchool(app, `TE${run}`);
    tokens = s.tokens;
    schoolId = s.school.id;
    const yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    await prisma.period.createMany({ data: [1, 2, 3, 4, 5].map((number) => ({ schoolId, number, session: Session.MORNING, startTime: `0${6 + number}:00`, endTime: `0${6 + number}:45` })) });

    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-te${run}@test.vn`.toLowerCase() } });
    gv2Token = await login(`gv2-te${run}@test.vn`, 'Trần Văn Hùng', Role.TEACHER);
    admin2Token = await login(`admin2-te${run}@test.vn`, 'Đỗ Mạnh Cường', Role.ADMIN);
    const gv2User = await prisma.user.findUniqueOrThrow({ where: { email: `gv2-te${run}@test.vn` } });
    gv1 = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', gender: Gender.FEMALE, userId: teacherUser.id } })).id;
    gv2 = (await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng', gender: Gender.MALE, userId: gv2User.id } })).id;
    gv3 = (await prisma.teacher.create({ data: { schoolId, code: 'GV3', fullName: 'Lê Thu Hà', gender: Gender.FEMALE } })).id;
    gvLeft = (await prisma.teacher.create({ data: { schoolId, code: 'GV9', fullName: 'Phạm Văn Cũ', status: TeacherStatus.RESIGNED } })).id;
    const klass = (name: string, gradeLevel: number, homeroomTeacherId?: string) => prisma.class.create({ data: { schoolId, academicYearId: yearId, name, gradeLevel, homeroomTeacherId } });
    class6A = (await klass('6A', 6, gv1)).id;
    class6B = (await klass('6B', 6, gv2)).id;
    class7A = (await klass('7A', 7)).id;
    const subject = (code: string, name: string) => prisma.subject.create({ data: { schoolId, code, name } });
    toan = (await subject('TOAN', 'Toán')).id;
    van = (await subject('VAN', 'Ngữ văn')).id;
    anh = (await subject('ANH', 'Tiếng Anh')).id;
    await prisma.subjectSetting.create({ data: { schoolId, subjectId: toan, assessment: 'SCORE', regularCount: 4, periodsPerYear: 140 } });

    a1 = await createStudent(app, schoolId, { classId: class6A, fullName: 'Nguyễn Minh An' });
    a2 = await createStudent(app, schoolId, { classId: class6A, fullName: 'Trần Ngọc Bích' });
    a3 = await createStudent(app, schoolId, { classId: class6A, fullName: 'Lê Khánh Chi' });
    b1 = await createStudent(app, schoolId, { classId: class6B, fullName: 'Phạm Gia Dũng' });
    const guardian = async (studentId: string, fullName: string, relationship: GuardianRelationship) =>
      (await prisma.guardian.create({ data: { studentId, fullName, relationship, phone: '0912000000', isPrimary: true } })).id;
    guardianA1 = await guardian(a1.student.id, 'Nguyễn Văn Bình', GuardianRelationship.FATHER);
    guardianA2 = await guardian(a2.student.id, 'Trần Thị Cúc', GuardianRelationship.MOTHER);
    guardianB1 = await guardian(b1.student.id, 'Phạm Văn Dương', GuardianRelationship.FATHER);
    parent = await createParent(app, schoolId, [a1.student.id]);

    // 6A's timetable: Toán on Monday (periods 1 and 2) and Wednesday (period 1), Ngữ văn on Tuesday.
    const slot = (subjectId: string, teacherId: string, dayOfWeek: number, periodNumber: number) => ({ schoolId, academicYearId: yearId, semester: 1, classId: class6A, subjectId, teacherId, dayOfWeek, periodNumber });
    await prisma.timetableEntry.createMany({ data: [slot(toan, gv1, 1, 1), slot(toan, gv1, 1, 2), slot(toan, gv1, 3, 1), slot(van, gv2, 2, 1)] });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lets the school staff read and only its leaders change assignments and duties', async () => {
    await api().get('/api/v1/teaching/workload').query({ semester: 1 }).set(bearer(parent.token)).expect(403);
    await api().get('/api/v1/teaching/assignments').query({ semester: 1 }).set(bearer(parent.token)).expect(403);
    await api().get('/api/v1/homeroom/book').query({ classId: class6A }).set(bearer(parent.token)).expect(403);
    await api().get('/api/v1/teaching/workload').query({ semester: 1 }).set(staff()).expect(200);
    await api().put('/api/v1/teaching/assignments').set(teacher()).send({ classId: class6A, subjectId: toan, semester: 1, teachers: [{ teacherId: gv1, periodsPerWeek: 4 }] }).expect(403);
    await api().put('/api/v1/teaching/homeroom').set(teacher()).send({ items: [{ classId: class7A, teacherId: gv1 }] }).expect(403);
    await api().post('/api/v1/teaching/duty-types').set(teacher()).send({ code: 'X', name: 'X', kind: 'OTHER', periods: 1 }).expect(403);
    await api().put('/api/v1/teaching/workload/settings').set(staff()).send({ teacherNorm: 17, homeroomReduction: 4 }).expect(403);
  });

  it('keeps the gradebook open to any teacher until the semester has assignments', async () => {
    const res = await api().get('/api/v1/grades/book').query({ classId: class6A, subjectId: toan, semester: 1 }).set(teacher2()).expect(200);
    expect(res.body.assignment).toEqual({ recorded: false, teachers: [], mine: true });
    await marks(teacher2(), toan).expect(200);
  });

  it("starts from the circular's catalogue of positions and duties", async () => {
    const res = await api().get('/api/v1/teaching/duty-types').set(teacher()).expect(200);
    for (const t of res.body) types[t.code] = t.id;
    const byCode = (code: string) => res.body.find((t: any) => t.code === code);
    // A school teaching grades 6 and 7 is THCS: the Tổng phụ trách Đội has a norm of 6 periods.
    expect(byCode('TPTD')).toMatchObject({ kind: 'POSITION', periods: 6, used: 0 });
    expect(byCode('HT')).toMatchObject({ kind: 'POSITION', periods: 2, name: 'Hiệu trưởng' });
    expect(byCode('PHT')).toMatchObject({ kind: 'POSITION', periods: 4 });
    expect(byCode('TTCM')).toMatchObject({ kind: 'CONCURRENT', periods: 3, basis: 'Điều 9 Thông tư 05/2025/TT-BGDĐT' });
    expect(byCode('NCN')).toMatchObject({ kind: 'OTHER', periods: 3 });
    expect(res.body.map((t: any) => t.kind)).toEqual([...res.body.map((t: any) => t.kind)].sort((a: string, b: string) => ['POSITION', 'CONCURRENT', 'OTHER'].indexOf(a) - ['POSITION', 'CONCURRENT', 'OTHER'].indexOf(b)));

    const created = await api().post('/api/v1/teaching/duty-types').set(admin()).send({ code: 'tbvn', name: 'Trưởng ban văn nghệ', kind: 'OTHER', periods: 1 }).expect(201);
    expect(created.body).toMatchObject({ code: 'TBVN', periods: 1, used: 0 });
    types.TBVN = created.body.id;
    const dup = await api().post('/api/v1/teaching/duty-types').set(admin()).send({ code: 'TBVN', name: 'Khác', kind: 'OTHER', periods: 1 }).expect(409);
    expect(dup.body.message).toBe('Mã đã có trong danh mục');
    await api().patch(`/api/v1/teaching/duty-types/${types.TBVN}`).set(admin()).send({ active: false }).expect(200);
  });

  it('records who teaches what: by hand, from the timetable and copied to semester 2', async () => {
    const cell = (body: Record<string, unknown>) => api().put('/api/v1/teaching/assignments').set(admin()).send({ semester: 1, ...body });
    const set = await cell({ classId: class6A, subjectId: van, teachers: [{ teacherId: gv2, periodsPerWeek: 4 }] }).expect(200);
    expect(set.body).toEqual([expect.objectContaining({ teacher: expect.objectContaining({ id: gv2 }), periodsPerWeek: 4 })]);
    expect((await cell({ classId: class6A, subjectId: van, teachers: [{ teacherId: gv2, periodsPerWeek: 2 }, { teacherId: gv2, periodsPerWeek: 2 }] }).expect(400)).body.message).toBe('Một giáo viên chỉ ghi một lần cho mỗi môn của lớp');
    expect((await cell({ classId: class7A, subjectId: van, teachers: [{ teacherId: gvLeft, periodsPerWeek: 4 }] }).expect(400)).body.message).toBe('Phạm Văn Cũ không còn công tác');
    await cell({ classId: class6A, subjectId: van, teachers: [{ teacherId: gv2, periodsPerWeek: 0 }] }).expect(400);

    // Toán has no assignment yet: it comes from the timetable's 3 periods; Ngữ văn keeps its 4.
    expect((await api().post('/api/v1/teaching/assignments/from-timetable').set(admin()).send({ semester: 1 }).expect(200)).body).toEqual({ created: 1 });
    const list = await api().get('/api/v1/teaching/assignments').query({ semester: 1, classId: class6A }).set(teacher()).expect(200);
    expect(list.body.items.map((a: any) => [a.subject.code, a.teacher.id, a.periodsPerWeek])).toEqual([
      ['VAN', gv2, 4],
      ['TOAN', gv1, 3],
    ]);
    expect(list.body.timetable).toEqual(expect.arrayContaining([{ classId: class6A, subjectId: van, teacherId: gv2, periods: 1 }]));
    // 140 periods a year over 35 weeks.
    expect(list.body.suggested[toan]).toBe(4);

    // Two teachers share Tiếng Anh in 6B.
    await cell({ classId: class6B, subjectId: anh, teachers: [{ teacherId: gv3, periodsPerWeek: 2 }, { teacherId: gv1, periodsPerWeek: 1 }] }).expect(200);
    await cell({ classId: class7A, subjectId: anh, teachers: [{ teacherId: gv3, periodsPerWeek: 3 }] }).expect(200);

    expect((await api().post('/api/v1/teaching/assignments/copy').set(admin()).send({ from: 1, to: 2 }).expect(200)).body).toEqual({ created: 5 });
    expect((await api().post('/api/v1/teaching/assignments/copy').set(admin()).send({ from: 1, to: 2 }).expect(200)).body).toEqual({ created: 0 });
    expect((await api().post('/api/v1/teaching/assignments/copy').set(admin()).send({ from: 1, to: 1 }).expect(400)).body.message).toBe('Chọn hai học kỳ khác nhau');
    // An empty list clears a cell.
    expect((await cell({ semester: 2, classId: class7A, subjectId: anh, teachers: [] }).expect(200)).body).toEqual([]);
    expect((await api().get('/api/v1/teaching/assignments').query({ semester: 2 }).set(admin()).expect(200)).body.items).toHaveLength(4);
  });

  it('lets only the assigned teacher write the marks once assignments are recorded', async () => {
    const blocked = await marks(teacher2(), toan, 8).expect(403);
    expect(blocked.body.message).toBe(NOT_ASSIGNED_MESSAGE);
    await marks(teacher(), toan, 8).expect(200);
    // The office is not bound by the assignments; the Ngữ văn teacher writes Ngữ văn.
    await marks(admin(), toan, 9).expect(200);
    await marks(teacher2(), van).expect(200);
    const seen = await api().get('/api/v1/grades/book').query({ classId: class6A, subjectId: toan, semester: 1 }).set(teacher2()).expect(200);
    expect(seen.body.assignment).toEqual({ recorded: true, teachers: ['Nguyễn Thị Lan'], mine: false });
    const own = await api().get('/api/v1/grades/book').query({ classId: class6A, subjectId: toan, semester: 1 }).set(teacher()).expect(200);
    expect(own.body.assignment.mine).toBe(true);
  });

  it('sets the homeroom teacher of each class', async () => {
    const res = await api().get('/api/v1/teaching/homeroom').set(teacher()).expect(200);
    expect(res.body.maxConcurrent).toBe(2);
    expect(res.body.classes.map((c: any) => [c.name, c.homeroomTeacher?.id ?? null, c.students])).toEqual([
      ['6A', gv1, 3],
      ['6B', gv2, 1],
      ['7A', null, 0],
    ]);
    // Only active teachers can be given a class.
    expect(res.body.teachers.map((t: any) => t.id)).not.toContain(gvLeft);

    const put = (items: unknown[]) => api().put('/api/v1/teaching/homeroom').set(admin()).send({ items });
    expect((await put([{ classId: class7A, teacherId: gv3 }, { classId: class7A, teacherId: gv1 }]).expect(400)).body.message).toBe('Mỗi lớp chỉ ghi một lần');
    expect((await put([{ classId: class7A, teacherId: gvLeft }]).expect(400)).body.message).toBe('Phạm Văn Cũ không còn công tác');
    const saved = await put([{ classId: class7A, teacherId: gv3 }]).expect(200);
    expect(saved.body.classes.find((c: any) => c.id === class7A).homeroomTeacher.id).toBe(gv3);
    expect(saved.body.teachers.find((t: any) => t.id === gv3).homeroomClasses).toEqual(['7A']);
  });

  it("works out each teacher's load against the norm and the circular's limits", async () => {
    const duty = (body: Record<string, unknown>) => api().post('/api/v1/teaching/duties').set(admin()).send(body);
    const ttcm = await duty({ teacherId: gv1, dutyTypeId: types.TTCM, note: 'Tổ Toán' }).expect(201);
    expect(ttcm.body).toMatchObject({ semester: null, periods: null, effectivePeriods: 3, note: 'Tổ Toán' });
    // The whole year and one semester overlap.
    expect((await duty({ teacherId: gv1, dutyTypeId: types.TTCM, semester: 2 }).expect(409)).body.message).toBe('Giáo viên đã được phân công nhiệm vụ này trong thời gian đó');
    expect((await duty({ teacherId: gv1, dutyTypeId: types.TBVN }).expect(400)).body.message).toBe('Trưởng ban văn nghệ đã ngừng sử dụng');
    expect((await duty({ teacherId: gvLeft, dutyTypeId: types.TKHD }).expect(400)).body.message).toBe('Phạm Văn Cũ không còn công tác');
    await duty({ teacherId: gv1, dutyTypeId: types.TKHD }).expect(201);
    await duty({ teacherId: gv3, dutyTypeId: types.PHT }).expect(201);
    await duty({ teacherId: gv3, dutyTypeId: types.HT, semester: 2 }).expect(201);

    const w1 = await workload(1);
    expect(w1.setting).toMatchObject({ level: 'THCS', teacherNorm: 19, homeroomReduction: 4, custom: false });
    // Nguyễn Thị Lan: 19 less 4 (homeroom), 3 (tổ trưởng) and 2 (thư ký) = 10; she teaches Toán 6A (3) and shares Tiếng Anh 6B (1).
    expect(rowOf(w1, gv1)).toMatchObject({
      position: null,
      norm: 19,
      reductions: [
        { label: 'Chủ nhiệm lớp 6A', periods: 4 },
        { label: 'Tổ trưởng chuyên môn (Tổ Toán)', periods: 3 },
        { label: 'Thư ký hội đồng trường', periods: 2 },
      ],
      required: 10,
      assigned: 4,
      difference: -6,
      concurrent: 3,
      warnings: ['Kiêm nhiệm 3 nhiệm vụ, quá 02 nhiệm vụ cho phép (Điều 3 Thông tư 05/2025/TT-BGDĐT)'],
    });
    expect(rowOf(w1, gv1).teaching).toEqual([
      { subject: 'Tiếng Anh', classes: ['6B'], periods: 1 },
      { subject: 'Toán', classes: ['6A'], periods: 3 },
    ]);
    // Lê Thu Hà, phó hiệu trưởng: a norm of 4, less 4 for 7A, so the 5 periods she teaches are all over it, beyond half the norm.
    expect(rowOf(w1, gv3)).toMatchObject({ position: 'Phó hiệu trưởng', norm: 4, required: 0, assigned: 5, difference: 5, warnings: ['Dạy vượt 5 tiết/tuần, quá 50% định mức 4 tiết (Điều 3 Thông tư 05/2025/TT-BGDĐT)'] });
    expect(rowOf(w1, gv2)).toMatchObject({ required: 15, assigned: 4, difference: -11, warnings: [] });
    expect(w1.rows[0].teacher.id).toBe(gv3); // positions first
    expect(w1.totals).toMatchObject({ assigned: 13, over: 1, short: 2, warnings: 2 });

    // In semester 2 she is also acting principal: the lower norm applies, and 7A's Tiếng Anh was taken off her.
    expect(rowOf(await workload(2), gv3)).toMatchObject({
      norm: 2,
      assigned: 2,
      warnings: ['Dạy vượt 2 tiết/tuần, quá 50% định mức 2 tiết (Điều 3 Thông tư 05/2025/TT-BGDĐT)', 'Giữ 2 chức vụ có định mức riêng; tính theo định mức thấp nhất'],
    });

    // A teacher's own number of periods for a duty replaces the catalogue's.
    const patched = await api().patch(`/api/v1/teaching/duties/${ttcm.body.id}`).set(admin()).send({ periods: 2 }).expect(200);
    expect(patched.body).toMatchObject({ periods: 2, effectivePeriods: 2 });
    expect(rowOf(await workload(1), gv1)).toMatchObject({ reduced: 8, required: 11 });
    expect((await api().patch(`/api/v1/teaching/duties/${ttcm.body.id}`).set(admin()).send({ teacherId: gv2 }).expect(400)).body.message).toBe('Không đổi giáo viên của một phân công; hãy xóa và thêm mới');

    // A catalogue entry teachers hold keeps its kind and cannot be deleted.
    expect((await api().patch(`/api/v1/teaching/duty-types/${types.TTCM}`).set(admin()).send({ kind: 'OTHER' }).expect(400)).body.message).toBe('Đã có giáo viên được phân công: không đổi loại, hãy thêm mục mới');
    expect((await api().delete(`/api/v1/teaching/duty-types/${types.TTCM}`).set(admin()).expect(400)).body.message).toBe('Đã có giáo viên được phân công: hãy ngừng sử dụng thay vì xóa');
    await api().delete(`/api/v1/teaching/duty-types/${types.TBVN}`).set(admin()).expect(204);

    // Phân công chủ nhiệm lists the concurrent duties next to the homeroom classes.
    const homeroom = await api().get('/api/v1/teaching/homeroom').set(admin()).expect(200);
    expect(homeroom.body.teachers.find((t: any) => t.id === gv1)).toMatchObject({ homeroomClasses: ['6A'], duties: ['Tổ trưởng chuyên môn', 'Thư ký hội đồng trường'] });

    // A school with its own norms (a boarding school, say), then back to the circular's.
    const custom = await api().put('/api/v1/teaching/workload/settings').set(admin()).send({ teacherNorm: 17, homeroomReduction: 3 }).expect(200);
    expect(custom.body).toMatchObject({ teacherNorm: 17, homeroomReduction: 3, custom: true, defaults: { teacherNorm: 19, homeroomReduction: 4 } });
    expect(rowOf(await workload(1), gv1)).toMatchObject({ norm: 17, reduced: 7, required: 10 });
    expect((await api().delete('/api/v1/teaching/workload/settings').set(admin()).expect(200)).body).toMatchObject({ teacherNorm: 19, custom: false });
  });

  it("keeps each teacher's lịch báo giảng against the timetable", async () => {
    const week = await api().get('/api/v1/teaching/calendar').query({ date: '2026-10-07' }).set(teacher()).expect(200);
    // The year opened on Saturday 05/09/2026, so its first week began on Monday 07/09.
    expect(week.body).toMatchObject({ teacher: { id: gv1 }, week: { number: 5, from: '2026-10-05', to: '2026-10-10' }, editable: true, periods: 3, planned: 0 });
    expect(week.body.days.map((d: any) => [d.date, d.slots.map((s: any) => s.periodNumber)])).toEqual([
      ['2026-10-05', [1, 2]],
      ['2026-10-06', []],
      ['2026-10-07', [1]],
      ['2026-10-08', []],
      ['2026-10-09', []],
      ['2026-10-10', []],
    ]);

    const save = (entries: unknown[], auth = teacher(), teacherId?: string) => api().put('/api/v1/teaching/calendar').set(auth).send({ teacherId, entries });
    const lesson = { date: '2026-10-05', periodNumber: 1, classId: class6A, subjectId: toan, lessonNo: 17, title: 'Bài 9. Dấu hiệu chia hết', aids: 'Máy chiếu' };
    // A make-up period on Saturday, outside the timetable.
    const makeUp = { date: '2026-10-10', periodNumber: 3, classId: class6A, subjectId: toan, lessonNo: 18, title: 'Dạy bù: Bài 10. Số nguyên tố' };
    const saved = await save([lesson, makeUp]).expect(200);
    expect(saved.body.planned).toBe(2);
    expect(saved.body.days[0].slots[0]).toMatchObject({ scheduled: true, plan: { lessonNo: 17, title: 'Bài 9. Dấu hiệu chia hết', aids: 'Máy chiếu' } });
    expect(saved.body.days[5].slots).toEqual([expect.objectContaining({ periodNumber: 3, scheduled: false, plan: expect.objectContaining({ lessonNo: 18 }) })]);

    expect((await save([lesson, { ...lesson, title: 'Khác' }]).expect(400)).body.message).toBe('Một tiết chỉ ghi một lần');
    expect((await save([{ ...lesson, periodNumber: 9 }]).expect(400)).body.message).toBe('Tiết học chưa được khai báo trong khung giờ của trường');
    expect((await save([{ ...lesson, date: '2026-02-30' }]).expect(400)).body.message).toBe('Ngày không hợp lệ: 2026-02-30');

    // Another teacher reads it but cannot write it; the school's leaders can.
    const other = await api().get('/api/v1/teaching/calendar').query({ teacherId: gv1, date: '2026-10-05' }).set(teacher2()).expect(200);
    expect(other.body).toMatchObject({ editable: false, planned: 2 });
    expect((await save([lesson], teacher2(), gv1).expect(403)).body.message).toBe('Chỉ giáo viên hoặc ban giám hiệu được sửa lịch báo giảng');
    // An empty title takes the period off the calendar.
    expect((await save([{ ...makeUp, title: '' }], admin(), gv1).expect(200)).body.planned).toBe(1);
    // An office account has no calendar of its own.
    expect((await api().get('/api/v1/teaching/calendar').set(staff()).expect(400)).body.message).toBe('Chọn giáo viên');

    // The sổ đầu bài shows the lesson planned for the period.
    const log = await api().get('/api/v1/homeroom/logbook').query({ classId: class6A, from: '2026-10-05', to: '2026-10-10' }).set(teacher()).expect(200);
    const monday = log.body.days.find((d: any) => d.date === '2026-10-05');
    expect(monday.slots.map((s: any) => [s.periodNumber, s.plan])).toEqual([
      [1, { lessonNo: 17, title: 'Bài 9. Dấu hiệu chia hết' }],
      [2, null],
    ]);
  });

  it('lets the homeroom teacher write the sổ chủ nhiệm, the office read it and others keep out', async () => {
    const own = await book();
    expect(own).toMatchObject({
      class: { id: class6A, name: '6A', homeroomTeacher: { id: gv1 } },
      editable: true,
      canReview: false,
      span: { from: '2026-09-05', to: '2027-08-31' },
      situation: { total: 3 },
      officers: [],
      seating: null,
      yearPlan: {},
    });
    // Subject teachers come from the assignments of each semester.
    expect(own.subjectTeachers.map((s: any) => [s.subject.code, s.semester1, s.semester2])).toEqual([
      ['TOAN', ['Nguyễn Thị Lan'], ['Nguyễn Thị Lan']],
      ['VAN', ['Trần Văn Hùng'], ['Trần Văn Hùng']],
    ]);
    expect(own.students.find((s: any) => s.id === a1.student.id).guardians.map((g: any) => [g.fullName, g.relationship])).toEqual([
      ['Nguyễn Văn Bình', 'FATHER'],
      ['Phụ huynh', 'MOTHER'],
    ]);

    const other = await api().get('/api/v1/homeroom/book').query({ classId: class6A }).set(teacher2()).expect(403);
    expect(other.body.message).toBe(HOMEROOM_ONLY);
    expect(await book(staff())).toMatchObject({ editable: false, canReview: false });
    expect((await saveBook({ yearPlan: { goals: 'X' } }, staff()).expect(403)).body.message).toBe(BOOK_WRITE_ONLY);
    expect(await book(admin())).toMatchObject({ editable: true, canReview: true });
  });

  it("checks the class officers, parents' committee, tổ and seating chart against the class", async () => {
    const name = (s: typeof a1) => s.student.fullName;
    // Blank roles and repeats are dropped.
    const officers = await saveBook({ officers: [{ role: 'Lớp trưởng', studentId: a1.student.id }, { role: '  ', studentId: a2.student.id }, { role: 'lớp trưởng', studentId: a1.student.id }] }).expect(200);
    expect(officers.body.officers).toEqual([{ role: 'Lớp trưởng', student: expect.objectContaining({ id: a1.student.id }) }]);
    expect(officers.body.updatedBy).toBe('TEACHER');
    expect((await saveBook({ officers: [{ role: 'Lớp phó', studentId: b1.student.id }] }).expect(400)).body.message).toBe('Lớp phó: học sinh không thuộc lớp');

    expect((await saveBook({ parentCommittee: [{ role: 'Trưởng ban', guardianId: guardianB1 }] }).expect(400)).body.message).toBe('Trưởng ban: không phải cha mẹ của học sinh trong lớp');
    expect((await saveBook({ parentCommittee: [{ role: 'Trưởng ban', guardianId: guardianA1 }, { role: 'Ủy viên', guardianId: guardianA1 }] }).expect(400)).body.message).toBe('Mỗi phụ huynh chỉ giữ một chức vụ trong ban đại diện');
    const committee = await saveBook({ parentCommittee: [{ role: 'Trưởng ban', guardianId: guardianA1 }, { role: 'Phó trưởng ban', guardianId: guardianA2 }] }).expect(200);
    expect(committee.body.parentCommittee.map((m: any) => [m.role, m.guardian.fullName, m.student.fullName])).toEqual([
      ['Trưởng ban', 'Nguyễn Văn Bình', name(a1)],
      ['Phó trưởng ban', 'Trần Thị Cúc', name(a2)],
    ]);
    // Saving one part keeps the others.
    expect(committee.body.officers).toHaveLength(1);

    const groups = (g: unknown[]) => saveBook({ groups: g });
    expect((await groups([{ name: 'Tổ 1', studentIds: [a1.student.id] }, { name: 'tổ 1', studentIds: [a3.student.id] }]).expect(400)).body.message).toBe('Trùng tên tổ: tổ 1');
    expect((await groups([{ name: 'Tổ 1', studentIds: [a1.student.id, a2.student.id] }, { name: 'Tổ 2', studentIds: [a2.student.id] }]).expect(400)).body.message).toBe(`${name(a2)} đã ở Tổ 1`);
    expect((await groups([{ name: 'Tổ 1', leaderId: a3.student.id, studentIds: [a1.student.id] }]).expect(400)).body.message).toBe('Tổ 1: tổ trưởng phải là thành viên của tổ');
    const grouped = await groups([{ name: 'Tổ 1', leaderId: a1.student.id, studentIds: [a1.student.id, a2.student.id] }]).expect(200);
    expect(grouped.body.groups).toEqual([{ name: 'Tổ 1', leader: expect.objectContaining({ id: a1.student.id }), students: [expect.objectContaining({ id: a1.student.id }), expect.objectContaining({ id: a2.student.id })] }]);
    expect(grouped.body.ungrouped.map((s: any) => s.id)).toEqual([a3.student.id]);

    const seating = (seats: unknown[][], rows = 1) => saveBook({ seating: { columns: 2, rows, seatsPerDesk: 2, seats } });
    expect((await seating([[a1.student.id, null, a2.student.id, null]], 2).expect(400)).body.message).toBe('Sơ đồ chỗ ngồi phải có 2 hàng bàn, mỗi hàng 4 chỗ');
    expect((await seating([[a1.student.id, null, a1.student.id, null]]).expect(400)).body.message).toBe(`${name(a1)} được xếp hai chỗ`);
    expect((await seating([[b1.student.id, null, null, null]]).expect(400)).body.message).toBe('Sơ đồ chỗ ngồi có học sinh không thuộc lớp');
    const seated = await seating([[a1.student.id, '', a2.student.id, null]]).expect(200);
    expect(seated.body.seating.seats).toEqual([[expect.objectContaining({ id: a1.student.id }), null, expect.objectContaining({ id: a2.student.id }), null]]);
    expect(seated.body.unseated.map((s: any) => s.id)).toEqual([a3.student.id]);
    expect((await saveBook({ seating: null }).expect(200)).body.seating).toBeNull();

    // The year plan: parts sent replace those kept, a blank part clears it.
    await saveBook({ yearPlan: { goals: 'Lớp đoàn kết, tự quản tốt' } }).expect(200);
    expect((await saveBook({ yearPlan: { targets: '100% học sinh đạt mức Đạt trở lên' } }).expect(200)).body.yearPlan).toEqual({ goals: 'Lớp đoàn kết, tự quản tốt', targets: '100% học sinh đạt mức Đạt trở lên' });
    expect((await saveBook({ yearPlan: { goals: '' } }).expect(200)).body.yearPlan).toEqual({ targets: '100% học sinh đạt mức Đạt trở lên' });
  });

  it('keeps month plans, parent meetings and the students followed within the school year', async () => {
    const month = (body: Record<string, unknown>, auth = teacher()) => api().put('/api/v1/homeroom/book/month-plans').set(auth).send({ classId: class6A, ...body });
    const october = await month({ month: '2026-10', theme: 'Chăm ngoan, học giỏi', tasks: 'Thi đua học tốt' }).expect(200);
    expect(october.body).toMatchObject({ month: '2026-10', theme: 'Chăm ngoan, học giỏi', review: null });
    // Writing the same month again updates it.
    expect((await month({ month: '2026-10', tasks: 'Thi đua học tốt', review: 'Hoàn thành' }).expect(200)).body).toMatchObject({ id: october.body.id, theme: null, review: 'Hoàn thành' });
    expect((await month({ month: '2027-09', tasks: 'X' }).expect(400)).body.message).toBe('Tháng phải thuộc năm học 2026-2027');
    expect((await month({ month: '2026-08', tasks: 'X' }).expect(400)).body.message).toBe('Tháng phải thuộc năm học 2026-2027');
    // The summer after the year still belongs to its book.
    await month({ month: '2027-07', tasks: 'Rèn luyện trong hè' }).expect(200);
    expect((await month({ month: '2026-11', tasks: '   ' }).expect(400)).body.message).toBe('Nhập nội dung kế hoạch');
    await api().delete(`/api/v1/homeroom/book/month-plans/${october.body.id}`).set(teacher2()).expect(403);
    await api().delete(`/api/v1/homeroom/book/month-plans/${october.body.id}`).set(teacher()).expect(204);
    expect((await book()).monthPlans.map((m: any) => m.month)).toEqual(['2027-07']);

    const meeting = { classId: class6A, date: '2026-09-20', title: 'Họp cha mẹ học sinh đầu năm học', invited: 3, content: 'Báo cáo tình hình lớp' };
    expect((await api().post('/api/v1/homeroom/book/meetings').set(teacher()).send({ ...meeting, attended: 4 }).expect(400)).body.message).toBe('Số phụ huynh dự họp không thể nhiều hơn số được mời');
    expect((await api().post('/api/v1/homeroom/book/meetings').set(teacher()).send({ ...meeting, date: '2027-09-01' }).expect(400)).body.message).toBe('Ngày phải thuộc năm học 2026-2027');
    const held = await api().post('/api/v1/homeroom/book/meetings').set(teacher()).send({ ...meeting, attended: 2, opinions: '  ' }).expect(201);
    expect(held.body).toMatchObject({ date: '2026-09-20', invited: 3, attended: 2, opinions: null });
    // The check uses the stored numbers for those left out.
    await api().patch(`/api/v1/homeroom/book/meetings/${held.body.id}`).set(teacher()).send({ invited: 1 }).expect(400);
    expect((await api().patch(`/api/v1/homeroom/book/meetings/${held.body.id}`).set(teacher()).send({ attended: 3, conclusions: 'Thống nhất' }).expect(200)).body).toMatchObject({ attended: 3, invited: 3, conclusions: 'Thống nhất' });
    await api().patch(`/api/v1/homeroom/book/meetings/${held.body.id}`).set(staff()).send({ attended: 1 }).expect(403);

    const note = { classId: class6A, studentId: a2.student.id, date: '2026-09-17', kind: 'ATTENTION', content: 'Hay nói chuyện riêng trong giờ học' };
    expect((await api().post('/api/v1/homeroom/book/notes').set(teacher()).send({ ...note, studentId: b1.student.id }).expect(400)).body.message).toBe('Học sinh không thuộc lớp');
    const followed = await api().post('/api/v1/homeroom/book/notes').set(teacher()).send({ ...note, action: 'Xếp ngồi bàn đầu' }).expect(201);
    expect(followed.body).toMatchObject({ date: '2026-09-17', kind: 'ATTENTION', action: 'Xếp ngồi bàn đầu', result: null, student: { id: a2.student.id } });
    const progress = await api().patch(`/api/v1/homeroom/book/notes/${followed.body.id}`).set(teacher()).send({ kind: 'PROGRESS', result: 'Đã tiến bộ' }).expect(200);
    expect(progress.body).toMatchObject({ kind: 'PROGRESS', result: 'Đã tiến bộ', action: 'Xếp ngồi bàn đầu' });
    await api().post('/api/v1/homeroom/book/notes').set(teacher()).send({ ...note, kind: 'OUTSTANDING', studentId: a1.student.id, date: '2026-10-02', content: 'Giải Nhất Rung chuông vàng' }).expect(201);
    // Newest first.
    expect((await book()).notes.map((n: any) => n.date)).toEqual(['2026-10-02', '2026-09-17']);
    await api().delete(`/api/v1/homeroom/book/notes/${followed.body.id}`).set(teacher2()).expect(403);
    await api().delete(`/api/v1/homeroom/book/notes/${followed.body.id}`).set(teacher()).expect(204);
    await api().delete(`/api/v1/homeroom/book/meetings/${held.body.id}`).set(teacher()).expect(204);
    expect(await book()).toMatchObject({ meetings: [], notes: [expect.objectContaining({ kind: 'OUTSTANDING' })] });
  });

  it("records the school leaders' review of the book", async () => {
    await api().post('/api/v1/homeroom/book/reviews').set(teacher()).send({ classId: class6A, content: 'Tốt' }).expect(403);
    const review = await api().post('/api/v1/homeroom/book/reviews').set(admin()).send({ classId: class6A, content: 'Sổ ghi chép đầy đủ' }).expect(201);
    // Without a date the review is dated today, kept within the school year.
    expect(review.body).toMatchObject({ date: today > '2027-08-31' ? '2027-08-31' : today < '2026-09-05' ? '2026-09-05' : today, author: 'ADMIN', mine: true });
    expect((await api().delete(`/api/v1/homeroom/book/reviews/${review.body.id}`).set(bearer(admin2Token)).expect(403)).body.message).toBe('Chỉ người ghi ý kiến mới được xóa ý kiến đó');
    await api().delete(`/api/v1/homeroom/book/reviews/${review.body.id}`).set(admin()).expect(204);
    await api().post('/api/v1/homeroom/book/reviews').set(bearer(admin2Token)).send({ classId: class6A, date: '2026-10-02', content: 'Đề nghị bổ sung biên bản họp' }).expect(201);
    expect((await book()).reviews).toEqual([expect.objectContaining({ date: '2026-10-02', author: 'Đỗ Mạnh Cường', mine: false, content: 'Đề nghị bổ sung biên bản họp' })]);
  });

  it('prints the sổ chủ nhiệm, the assignment tables and the lịch báo giảng', async () => {
    const report = (key: string, query: Record<string, unknown>, auth = admin()) => api().get(`/api/v1/reports/${key}`).query(query).set(auth);
    const texts = (doc: any) => doc.blocks.flatMap((b: any) => (b.type === 'text' ? b.lines : b.type === 'table' ? [b.caption, ...b.rows.flat()] : [])).filter((x: unknown) => typeof x === 'string');

    const printed = (await report('homeroom-book', { classId: class6A }, teacher()).expect(200)).body.document;
    expect(printed).toMatchObject({ title: 'Sổ chủ nhiệm', subtitles: ['Lớp 6A · Năm học 2026-2027'] });
    expect(texts(printed)).toEqual(expect.arrayContaining(['I. Danh sách giáo viên bộ môn', 'Lớp trưởng', 'Nguyễn Văn Bình', 'Giải Nhất Rung chuông vàng', 'Đề nghị bổ sung biên bản họp']));
    await report('homeroom-book', { classId: class6A }, teacher2()).expect(403);

    const staffing = (await report('teaching-assignments', { semester: 1 }).expect(200)).body.document;
    const lan = staffing.blocks.flatMap((b: any) => (b.type === 'table' ? b.rows : [])).find((r: any[]) => r[1] === 'Nguyễn Thị Lan');
    expect(lan.slice(2, 11)).toEqual(['Tổ trưởng chuyên môn (Tổ Toán); Thư ký hội đồng trường', 'Tiếng Anh: 6B (1); Toán: 6A (3)', '6A', '19', '8', '11', '4', '-7', 'Kiêm nhiệm 3 nhiệm vụ, quá 02 nhiệm vụ cho phép (Điều 3 Thông tư 05/2025/TT-BGDĐT)']);

    const byClass = (await report('teaching-by-class', { semester: 1 }).expect(200)).body.document;
    const table = byClass.blocks[0];
    expect(table.columns.map((c: any) => c.header)).toEqual(['Lớp', 'Giáo viên chủ nhiệm', 'Toán', 'Ngữ văn', 'Tiếng Anh', 'Tổng số tiết/tuần']);
    expect(table.rows).toEqual([
      ['6A', 'Nguyễn Thị Lan', 'Nguyễn Thị Lan (3)', 'Trần Văn Hùng (4)', '', '7'],
      ['6B', 'Trần Văn Hùng', '', '', 'Lê Thu Hà (2)\nNguyễn Thị Lan (1)', '3'],
      ['7A', 'Lê Thu Hà', '', '', 'Lê Thu Hà (3)', '3'],
    ]);

    const calendar = (await report('lesson-calendar', { teacherId: gv1, week: '2026-10-05' }).expect(200)).body.document;
    expect(calendar.subtitles).toEqual(['Tuần 5: từ ngày 05/10/2026 đến ngày 10/10/2026', 'Giáo viên: Nguyễn Thị Lan · Năm học 2026-2027']);
    expect(calendar.blocks[0].rows[0]).toEqual(['Thứ Hai\n05/10/2026', 'Sáng', 1, '6A', 'Toán', 17, 'Bài 9. Dấu hiệu chia hết', 'Máy chiếu', '']);
    // A teacher prints their own week without naming themselves.
    expect((await report('lesson-calendar', { week: '2026-10-05' }, teacher()).expect(200)).body.document.subtitles[1]).toContain('Nguyễn Thị Lan');
  });
});

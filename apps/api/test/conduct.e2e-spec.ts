import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { bearer, createApp, createClass, createParent, createSchool, createStudent, prisma, runId } from './helpers';

// Conduct (rèn luyện): criteria, self-assessment, homeroom review, approval and the parent view against a real Postgres.
describe('Conduct (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherSchoolTokens: typeof tokens;
  let schoolId: string;
  let yearId: string;
  let classId: string; // 6A, homeroom = the TEACHER user
  let otherClassId: string; // 6B, homeroom = teacher 2
  let teacher2Token: string;
  let students: Awaited<ReturnType<typeof createStudent>>[];
  let outsider: Awaited<ReturnType<typeof createStudent>>; // in 6B
  let parent: Awaited<ReturnType<typeof createParent>>;
  let criteria: any[];
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);
  const teacher2 = () => bearer(teacher2Token);

  /** A second TEACHER login of the school (the helpers only make one). */
  async function createTeacherLogin(code: string) {
    const email = `teacher-${code}@test.vn`.toLowerCase();
    const user = await prisma.user.create({ data: { schoolId, email, fullName: code, role: Role.TEACHER, passwordHash: await bcrypt.hash('Secret@123', 4) } });
    const res = await api().post('/api/v1/auth/login').send({ email, password: 'Secret@123' }).expect(200);
    return { user, token: res.body.accessToken as string };
  }

  /** Points for every active criterion, in list order. */
  const pointsFor = (key: 'selfPoints' | 'teacherPoints', values: number[]) => criteria.map((c, i) => ({ criterionId: c.id, [key]: values[i] }));
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const SELF_0 = [10, 9, 9, 15, 14, 9, 9, 10, 10]; // 95
  const TEACHER_0 = [10, 9, 8, 15, 14, 9, 9, 9, 9]; // 92 -> TOT
  const TEACHER_1 = [7, 6, 6, 10, 10, 7, 7, 6, 6]; // 65 -> DAT

  const notificationsOf = async (token: string) => {
    const res = await api().get('/api/v1/notifications').query({ kind: 'CONDUCT_APPROVED', pageSize: 50 }).set(bearer(token)).expect(200);
    return res.body.items as any[];
  };
  const termResult = (studentId: string, semester = 1) => prisma.termResult.findUnique({ where: { studentId_academicYearId_semester: { studentId, academicYearId: yearId, semester } } });

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `CD${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherSchoolTokens = (await createSchool(app, `CE${run}`)).tokens;
    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;

    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-cd${run}@test.vn`.toLowerCase() } });
    const teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUser.id } })).id;
    const t2 = await createTeacherLogin(`gv2-${run}`);
    teacher2Token = t2.token;
    const teacher2Id = (await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng', userId: t2.user.id } })).id;
    classId = (await createClass(schoolId, '6A', 6, teacherId)).id;
    otherClassId = (await createClass(schoolId, '6B', 6, teacher2Id)).id;

    students = [];
    for (const name of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu']) students.push(await createStudent(app, schoolId, { classId, fullName: name }));
    outsider = await createStudent(app, schoolId, { classId: otherClassId, fullName: 'Phạm Quốc Dũng' });
    parent = await createParent(app, schoolId, [students[0].student.id]);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('criteria', () => {
    it('creates the default criteria on first read and keeps them per school', async () => {
      const res = await api().get('/api/v1/conduct/criteria').set(teacher()).expect(200);
      criteria = res.body;
      expect(criteria).toHaveLength(9);
      expect(criteria[0]).toMatchObject({ code: 'RL01', maxPoints: 10, groupName: 'Ý thức học tập', isActive: true, itemCount: 0 });
      expect(sum(criteria.map((c) => c.maxPoints))).toBe(100);
      // The other school gets its own copy; ids never overlap.
      const other = await api().get('/api/v1/conduct/criteria').set(bearer(otherSchoolTokens.ADMIN)).expect(200);
      expect(other.body).toHaveLength(9);
      expect(other.body.map((c: any) => c.id)).not.toContain(criteria[0].id);
    });

    it('rejects writes that leave the active points different from 100', async () => {
      const post = await api().post('/api/v1/conduct/criteria').set(admin()).send({ code: 'RL10', name: 'Tiêu chí thêm', maxPoints: 10 }).expect(400);
      expect(post.body.message).toContain('110');
      const patch = await api().patch(`/api/v1/conduct/criteria/${criteria[0].id}`).set(admin()).send({ maxPoints: 20 }).expect(400);
      expect(patch.body.message).toContain('110');
      const del = await api().delete(`/api/v1/conduct/criteria/${criteria[8].id}`).set(admin()).expect(400);
      expect(del.body.message).toContain('90');
      const off = await api().patch(`/api/v1/conduct/criteria/${criteria[8].id}`).set(staff()).send({ isActive: false }).expect(400);
      expect(off.body.message).toContain('90');
    });

    it('accepts point-neutral edits and a bulk save that moves points around', async () => {
      const renamed = await api().patch(`/api/v1/conduct/criteria/${criteria[0].id}`).set(staff()).send({ name: 'Chuyên cần' }).expect(200);
      expect(renamed.body.name).toBe('Chuyên cần');
      // A criterion with 0 points may be added on its own.
      const zero = await api().post('/api/v1/conduct/criteria').set(admin()).send({ code: 'RL00', name: 'Không điểm', maxPoints: 0, groupName: 'Khác' }).expect(201);
      await api().delete(`/api/v1/conduct/criteria/${zero.body.id}`).set(admin()).expect(200).expect({ deleted: true, deactivated: false });

      const rows = criteria.map((c) => ({ id: c.id, code: c.code, name: c.name, maxPoints: c.maxPoints, groupName: c.groupName, sortOrder: c.sortOrder, isActive: true }));
      rows[0].maxPoints = 5;
      const bad = await api().put('/api/v1/conduct/criteria').set(admin()).send({ criteria: rows }).expect(400);
      expect(bad.body.message).toContain('95');
      const saved = await api()
        .put('/api/v1/conduct/criteria')
        .set(admin())
        .send({ criteria: [...rows, { code: 'RL10', name: 'Tham gia câu lạc bộ', maxPoints: 5, groupName: 'Hoạt động tập thể', sortOrder: 10 }] })
        .expect(200);
      expect(saved.body).toHaveLength(10);
      expect(saved.body.find((c: any) => c.code === 'RL01').maxPoints).toBe(5);
      expect(saved.body.find((c: any) => c.code === 'RL10')).toMatchObject({ maxPoints: 5, isActive: true });
      // Back to the defaults for the rest of the suite: the unused RL10 is deleted outright.
      rows[0].maxPoints = 10;
      const restored = await api().put('/api/v1/conduct/criteria').set(admin()).send({ criteria: rows }).expect(200);
      expect(restored.body).toHaveLength(9);
      criteria = restored.body;
    });

    it('is read-only for teachers and off limits to students', async () => {
      await api().post('/api/v1/conduct/criteria').set(teacher()).send({ code: 'X', name: 'X', maxPoints: 0 }).expect(403);
      await api().get('/api/v1/conduct/criteria').set(bearer(students[0].token)).expect(403);
    });
  });

  describe('opening a round', () => {
    it('creates DRAFT assessments once for every student of the class (homeroom teacher only)', async () => {
      await api().post('/api/v1/conduct/class/open').set(teacher2()).send({ classId, semester: 1, month: 0 }).expect(403);
      await api().post('/api/v1/conduct/class/open').set(teacher()).send({ classId, semester: 1, month: 0 }).expect(200).expect({ created: 3, total: 3 });
      await api().post('/api/v1/conduct/class/open').set(teacher()).send({ classId, semester: 1 }).expect(200).expect({ created: 0, total: 3 });

      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1, month: 0 }).set(teacher()).expect(200);
      expect(view.body.class.id).toBe(classId);
      expect(view.body.rows).toHaveLength(3);
      expect(view.body.rows.every((r: any) => r.assessment?.status === 'DRAFT')).toBe(true);
      expect(view.body.summary).toMatchObject({ total: 3, opened: 3, status: { DRAFT: 3, SELF_ASSESSED: 0, REVIEWED: 0, APPROVED: 0 } });
      expect(view.body.criteria).toHaveLength(9);

      const detail = await api().get(`/api/v1/conduct/assessments/${view.body.rows[0].assessment.id}`).set(teacher()).expect(200);
      expect(detail.body.items).toHaveLength(9);
      expect(detail.body.items[0]).toMatchObject({ selfPoints: null, teacherPoints: null, criterion: { code: 'RL01', maxPoints: 10, groupName: 'Ý thức học tập' } });
      await api().get(`/api/v1/conduct/assessments/${view.body.rows[0].assessment.id}`).set(teacher2()).expect(403);
    });

    it('refuses the class view to other teachers, students and other schools', async () => {
      await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(teacher2()).expect(403);
      await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(bearer(students[0].token)).expect(403);
      await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(bearer(otherSchoolTokens.ADMIN)).expect(404);
      await api().get('/api/v1/conduct/class').query({ classId, semester: 3 }).set(admin()).expect(400);
    });
  });

  describe('student self-assessment', () => {
    it('shows the student their own assessment and criteria', async () => {
      const res = await api().get('/api/v1/student/conduct').query({ semester: 1 }).set(bearer(students[0].token)).expect(200);
      expect(res.body.student).toMatchObject({ id: students[0].student.id, class: { id: classId, name: '6A' } });
      expect(res.body.semester).toBe(1);
      expect(res.body.month).toBe(0);
      expect(res.body.criteria).toHaveLength(9);
      expect(res.body.assessment).toMatchObject({ status: 'DRAFT', selfTotal: null });
      expect(res.body.assessment.items).toHaveLength(9);
    });

    it('creates a DRAFT on first view when the class was not opened yet', async () => {
      const res = await api().get('/api/v1/student/conduct').query({ semester: 2 }).set(bearer(outsider.token)).expect(200);
      expect(res.body.assessment).toMatchObject({ status: 'DRAFT', semester: 2, month: 0, class: { id: otherClassId } });
      const again = await api().get('/api/v1/student/conduct').query({ semester: 2 }).set(bearer(outsider.token)).expect(200);
      expect(again.body.assessment.id).toBe(res.body.assessment.id);
      // Monthly rounds are only what the teacher opened.
      const monthly = await api().get('/api/v1/student/conduct').query({ semester: 2, month: 9 }).set(bearer(outsider.token)).expect(200);
      expect(monthly.body.assessment).toBeNull();
    });

    it('rejects points above the maximum and records the self total', async () => {
      const tooMany = [...SELF_0];
      tooMany[0] = 11;
      const bad = await api().put('/api/v1/student/conduct/self').set(bearer(students[0].token)).send({ semester: 1, items: pointsFor('selfPoints', tooMany) }).expect(400);
      expect(bad.body.message).toContain('tối đa 10');
      await api().put('/api/v1/student/conduct/self').set(bearer(students[0].token)).send({ semester: 1, items: [{ criterionId: criteria[0].id, selfPoints: -1 }] }).expect(400);
      await api().put('/api/v1/student/conduct/self').set(bearer(students[0].token)).send({ semester: 1, items: [{ criterionId: 'nope', selfPoints: 1 }] }).expect(400);

      const items = pointsFor('selfPoints', SELF_0);
      items[2].note = 'Em phát biểu 3 lần/tuần';
      const res = await api()
        .put('/api/v1/student/conduct/self')
        .set(bearer(students[0].token))
        .send({ semester: 1, month: 0, items, selfComment: 'Em đi học đầy đủ, cần tích cực hơn' })
        .expect(200);
      expect(res.body.assessment).toMatchObject({ status: 'SELF_ASSESSED', selfTotal: 95, selfComment: 'Em đi học đầy đủ, cần tích cực hơn' });
      expect(res.body.assessment.items[2]).toMatchObject({ selfPoints: 9, note: 'Em phát biểu 3 lần/tuần' });

      // A second student submits lower points; they may resubmit while still SELF_ASSESSED.
      await api().put('/api/v1/student/conduct/self').set(bearer(students[1].token)).send({ semester: 1, items: pointsFor('selfPoints', TEACHER_1) }).expect(200);
      const resub = await api().put('/api/v1/student/conduct/self').set(bearer(students[1].token)).send({ semester: 1, items: pointsFor('selfPoints', [8, 7, 7, 12, 12, 8, 8, 7, 7]) }).expect(200);
      expect(resub.body.assessment.selfTotal).toBe(76);

      const history = await api().get('/api/v1/student/conduct/history').set(bearer(students[0].token)).expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0]).toMatchObject({ semester: 1, month: 0, status: 'SELF_ASSESSED', selfTotal: 95, class: { name: '6A' } });
    });

    it('keeps staff out of the student routes', async () => {
      await api().get('/api/v1/student/conduct').query({ semester: 1 }).set(staff()).expect(403);
      await api().put('/api/v1/student/conduct/self').set(teacher()).send({ semester: 1, items: [] }).expect(403);
      await api().get('/api/v1/student/conduct/history').set(admin()).expect(403);
    });
  });

  describe('homeroom review', () => {
    let assessmentIds: Record<string, string>;

    beforeAll(async () => {
      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(admin()).expect(200);
      assessmentIds = Object.fromEntries(view.body.rows.map((r: any) => [r.student.id, r.assessment.id]));
    });

    it('lets only the homeroom teacher (or the office) review', async () => {
      const id = assessmentIds[students[0].student.id];
      await api().put(`/api/v1/conduct/assessments/${id}/review`).set(teacher2()).send({ items: pointsFor('teacherPoints', TEACHER_0) }).expect(403);
      await api().put(`/api/v1/conduct/assessments/${id}/review`).set(bearer(students[0].token)).send({ items: [] }).expect(403);

      const over = [...TEACHER_0];
      over[3] = 16;
      await api().put(`/api/v1/conduct/assessments/${id}/review`).set(teacher()).send({ items: pointsFor('teacherPoints', over) }).expect(400);

      const items = pointsFor('teacherPoints', TEACHER_0);
      items[2].note = 'Phát biểu tốt nhưng chưa đều';
      const res = await api().put(`/api/v1/conduct/assessments/${id}/review`).set(teacher()).send({ items, teacherComment: 'Em ngoan, học tốt' }).expect(200);
      expect(res.body).toMatchObject({ status: 'REVIEWED', selfTotal: 95, teacherTotal: 92, finalTotal: null, level: null, teacherComment: 'Em ngoan, học tốt' });
      expect(res.body.reviewedById).toBeTruthy();
      expect(res.body.items[2]).toMatchObject({ selfPoints: 9, teacherPoints: 8, note: 'Phát biểu tốt nhưng chưa đều', criterion: { name: expect.any(String) } });

      // The office may review too, and a DRAFT (no self-assessment) can be reviewed directly.
      const second = await api().put(`/api/v1/conduct/assessments/${assessmentIds[students[1].student.id]}/review`).set(staff()).send({ items: pointsFor('teacherPoints', TEACHER_1) }).expect(200);
      expect(second.body).toMatchObject({ status: 'REVIEWED', teacherTotal: 65 });

      // The student cannot change their self-assessment any more.
      const locked = await api().put('/api/v1/student/conduct/self').set(bearer(students[0].token)).send({ semester: 1, items: pointsFor('selfPoints', SELF_0) }).expect(400);
      expect(locked.body.message).toContain('không thể sửa');

      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(teacher()).expect(200);
      expect(view.body.summary.status).toEqual({ DRAFT: 1, SELF_ASSESSED: 0, REVIEWED: 2, APPROVED: 0 });
    });
  });

  describe('approval', () => {
    it('requires REVIEWED, computes the level, writes TermResult.conduct and notifies the family', async () => {
      await api().post('/api/v1/conduct/class/approve').set(teacher()).send({ classId, semester: 1 }).expect(403);
      const notReviewed = await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, month: 0, studentIds: [students[2].student.id] }).expect(400);
      expect(notReviewed.body.message).toContain('chưa được giáo viên chủ nhiệm đánh giá');
      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, studentIds: [outsider.student.id] }).expect(400);

      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, month: 0 }).expect(200).expect({ approved: 2 });
      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, month: 0 }).expect(200).expect({ approved: 0 });

      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(admin()).expect(200);
      const byStudent = Object.fromEntries(view.body.rows.map((r: any) => [r.student.id, r.assessment]));
      expect(byStudent[students[0].student.id]).toMatchObject({ status: 'APPROVED', finalTotal: 92, level: 'TOT' });
      expect(byStudent[students[0].student.id].approvedAt).toBeTruthy();
      expect(byStudent[students[1].student.id]).toMatchObject({ status: 'APPROVED', finalTotal: 65, level: 'DAT' });
      expect(byStudent[students[2].student.id].status).toBe('DRAFT');
      expect(view.body.summary.level).toEqual({ TOT: 1, KHA: 0, DAT: 1, CHUA_DAT: 0 });

      expect(await termResult(students[0].student.id)).toMatchObject({ schoolId, classId, semester: 1, conduct: 'TOT', academic: null });
      expect(await termResult(students[1].student.id)).toMatchObject({ conduct: 'DAT' });
      expect(await termResult(students[2].student.id)).toBeNull();

      const mine = await notificationsOf(students[0].token);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ title: 'Kết quả rèn luyện', body: 'Kết quả rèn luyện học kỳ 1: Tốt (92 điểm)' });
      expect(mine[0].data).toMatchObject({ classId, semester: 1, month: 0, level: 'TOT', total: 92 });
      const family = await notificationsOf(parent.token);
      expect(family).toHaveLength(1);
      expect(family[0].body).toBe('Kết quả rèn luyện học kỳ 1: Tốt (92 điểm)');
      expect(family[0].student.id).toBe(students[0].student.id);
      expect(await notificationsOf(students[1].token)).toHaveLength(1);
      expect((await notificationsOf(students[1].token))[0].body).toBe('Kết quả rèn luyện học kỳ 1: Đạt (65 điểm)');
    });

    it('locks the assessment for the student and the teacher once approved', async () => {
      const id = (await api().get('/api/v1/student/conduct').query({ semester: 1 }).set(bearer(students[0].token)).expect(200)).body.assessment.id;
      await api().put('/api/v1/student/conduct/self').set(bearer(students[0].token)).send({ semester: 1, items: pointsFor('selfPoints', SELF_0) }).expect(400);
      const res = await api().put(`/api/v1/conduct/assessments/${id}/review`).set(teacher()).send({ items: pointsFor('teacherPoints', TEACHER_0) }).expect(400);
      expect(res.body.message).toContain('mở lại');
    });

    it('reopen clears TermResult.conduct and lets the office approve again', async () => {
      await api().post('/api/v1/conduct/class/reopen').set(teacher()).send({ classId, semester: 1 }).expect(403);
      await api().post('/api/v1/conduct/class/reopen').set(staff()).send({ classId, semester: 1, month: 0 }).expect(200).expect({ reopened: 2 });
      await api().post('/api/v1/conduct/class/reopen').set(staff()).send({ classId, semester: 1 }).expect(200).expect({ reopened: 0 });

      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1 }).set(admin()).expect(200);
      const a = view.body.rows.find((r: any) => r.student.id === students[0].student.id).assessment;
      expect(a).toMatchObject({ status: 'REVIEWED', teacherTotal: 92, finalTotal: null, level: null, approvedById: null, approvedAt: null });
      expect(await termResult(students[0].student.id)).toMatchObject({ conduct: null, classId });

      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, studentIds: [students[0].student.id] }).expect(200).expect({ approved: 1 });
      expect(await termResult(students[0].student.id)).toMatchObject({ conduct: 'TOT' });
      expect(await termResult(students[1].student.id)).toMatchObject({ conduct: null });
      // Approving the already-approved student again is a no-op, not an error.
      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, studentIds: [students[0].student.id] }).expect(200).expect({ approved: 0 });
    });

    it('monthly rounds never touch TermResult or notify', async () => {
      await api().post('/api/v1/conduct/class/open').set(teacher()).send({ classId, semester: 1, month: 10 }).expect(200).expect({ created: 3, total: 3 });
      const view = await api().get('/api/v1/conduct/class').query({ classId, semester: 1, month: 10 }).set(teacher()).expect(200);
      const id = view.body.rows.find((r: any) => r.student.id === students[1].student.id).assessment.id;
      await api().put(`/api/v1/conduct/assessments/${id}/review`).set(teacher()).send({ items: pointsFor('teacherPoints', TEACHER_0) }).expect(200);
      await api().post('/api/v1/conduct/class/approve').set(admin()).send({ classId, semester: 1, month: 10 }).expect(200).expect({ approved: 1 });
      const approved = await api().get(`/api/v1/conduct/assessments/${id}`).set(admin()).expect(200);
      expect(approved.body).toMatchObject({ month: 10, status: 'APPROVED', level: 'TOT', finalTotal: 92 });
      expect(await termResult(students[1].student.id)).toMatchObject({ conduct: null });
      expect(await notificationsOf(students[1].token)).toHaveLength(1);
    });

    it('summarises every class of the year', async () => {
      const res = await api().get('/api/v1/conduct/summary').query({ semester: 1 }).set(staff()).expect(200);
      expect(res.body.semester).toBe(1);
      const row = res.body.rows.find((r: any) => r.class.id === classId);
      expect(row).toMatchObject({ students: 3, status: { DRAFT: 1, SELF_ASSESSED: 0, REVIEWED: 1, APPROVED: 1 }, level: { TOT: 1, KHA: 0, DAT: 0, CHUA_DAT: 0 } });
      expect(res.body.rows.find((r: any) => r.class.id === otherClassId)).toMatchObject({ students: 1, status: { DRAFT: 0, SELF_ASSESSED: 0, REVIEWED: 0, APPROVED: 0 } });
      expect(res.body.totals.level.TOT).toBe(1);
      await api().get('/api/v1/conduct/summary').query({ semester: 1 }).set(bearer(parent.token)).expect(403);
    });
  });

  describe('parent app', () => {
    it("returns the child's assessment and nothing for other children", async () => {
      const res = await api().get(`/api/v1/parent/children/${students[0].student.id}/conduct`).query({ semester: 1 }).set(bearer(parent.token)).expect(200);
      expect(res.body.student).toMatchObject({ id: students[0].student.id, fullName: 'Nguyễn Văn An', class: { name: '6A' } });
      expect(res.body.criteria).toHaveLength(9);
      expect(res.body.assessment).toMatchObject({ status: 'APPROVED', selfTotal: 95, teacherTotal: 92, finalTotal: 92, level: 'TOT', teacherComment: 'Em ngoan, học tốt' });
      expect(res.body.assessment.items).toHaveLength(9);
      expect(res.body.assessment.items[0]).toMatchObject({ selfPoints: 10, teacherPoints: 10, criterion: { code: 'RL01' } });
      expect(res.body.history).toHaveLength(2);

      const none = await api().get(`/api/v1/parent/children/${students[0].student.id}/conduct`).query({ semester: 2 }).set(bearer(parent.token)).expect(200);
      expect(none.body.assessment).toBeNull();

      await api().get(`/api/v1/parent/children/${students[1].student.id}/conduct`).query({ semester: 1 }).set(bearer(parent.token)).expect(404);
      await api().get(`/api/v1/parent/children/${students[0].student.id}/conduct`).query({ semester: 1 }).set(bearer(students[0].token)).expect(403);
      await api().get(`/api/v1/parent/children/${students[0].student.id}/conduct`).query({ semester: 1 }).set(staff()).expect(403);
    });
  });
});

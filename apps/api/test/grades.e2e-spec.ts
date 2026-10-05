import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createParent, createSchool, createStudent, prisma, runId } from './helpers';

// Gradebook per Thông tư 22/2021: settings, marks, averages, levels, titles, học bạ, student and parent views.
describe('Grades (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let yearId: string;
  let classId: string; // 6A, homeroom = the TEACHER user
  let otherClassId: string; // 6B, homeroom = a teacher without an account
  let teacherId: string;
  let subjects: Record<string, string>;
  let students: Awaited<ReturnType<typeof createStudent>>[];
  let other: Awaited<ReturnType<typeof createStudent>>;
  let parent: Awaited<ReturnType<typeof createParent>>;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  const SCORE_SUBJECTS = ['TOAN', 'VAN', 'ANH', 'KHTN', 'LSDL', 'GDCD', 'TIN'];

  /** Full marks of one score subject for a student: n regular marks, GK and CK all equal to `value`. */
  const fullMarks = (studentId: string, value: number, regularCount = 3) => [
    ...Array.from({ length: regularCount }, (_, i) => ({ studentId, kind: 'TX', index: i + 1, value })),
    { studentId, kind: 'GK', index: 1, value },
    { studentId, kind: 'CK', index: 1, value },
  ];
  const saveBook = (subjectId: string, semester: number, entries: unknown[], auth = teacher()) =>
    api().put('/api/v1/grades/book').set(auth).send({ classId, subjectId, semester, entries });

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `GR${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-gr${run}@test.vn`.toLowerCase() } });
    teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUser.id } })).id;
    const teacher2Id = (await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng' } })).id;
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6A', gradeLevel: 6, homeroomTeacherId: teacherId } })).id;
    otherClassId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6B', gradeLevel: 6, homeroomTeacherId: teacher2Id } })).id;
    subjects = {};
    for (const [code, name] of [['TOAN', 'Toán'], ['VAN', 'Ngữ văn'], ['ANH', 'Tiếng Anh'], ['KHTN', 'Khoa học tự nhiên'], ['LSDL', 'Lịch sử và Địa lý'], ['GDCD', 'Giáo dục công dân'], ['TIN', 'Tin học'], ['GDTC', 'Giáo dục thể chất']]) {
      subjects[code] = (await prisma.subject.create({ data: { schoolId, code, name } })).id;
    }
    students = [];
    for (const name of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu']) students.push(await createStudent(app, schoolId, { classId, fullName: name }));
    other = await createStudent(app, schoolId, { classId: otherClassId, fullName: 'Phạm Quốc Dũng' });
    parent = await createParent(app, schoolId, [students[0].student.id]);
    // Two periods of Toán a week on the timetable -> 70 periods a year -> 3 regular marks suggested.
    await prisma.timetableEntry.createMany({
      data: [1, 3].map((dayOfWeek) => ({ schoolId, academicYearId: yearId, semester: 1, classId, subjectId: subjects.TOAN, teacherId, dayOfWeek, periodNumber: 1 })),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('settings', () => {
    it('lists every subject with defaults and a suggestion from the timetable', async () => {
      const res = await api().get('/api/v1/grades/settings').set(teacher()).expect(200);
      const byCode = Object.fromEntries(res.body.map((s: any) => [s.code, s]));
      expect(byCode.TOAN).toMatchObject({ assessment: 'SCORE', regularCount: 3, suggestedPeriodsPerYear: 70, suggestedRegularCount: 3 });
      expect(byCode.VAN).toMatchObject({ assessment: 'SCORE', regularCount: 3, suggestedRegularCount: null });
      // Display order puts Toán and Ngữ văn first.
      expect(res.body.slice(0, 3).map((s: any) => s.code)).toEqual(['TOAN', 'VAN', 'ANH']);
    });

    it('upserts a setting (office only)', async () => {
      await api().put(`/api/v1/grades/settings/${subjects.GDTC}`).set(teacher()).send({ assessment: 'COMMENT', regularCount: 2 }).expect(403);
      const res = await api().put(`/api/v1/grades/settings/${subjects.GDTC}`).set(staff()).send({ assessment: 'COMMENT', regularCount: 2 }).expect(200);
      expect(res.body).toMatchObject({ subjectId: subjects.GDTC, assessment: 'COMMENT', regularCount: 2 });
      await api().put(`/api/v1/grades/settings/${subjects.TOAN}`).set(admin()).send({ assessment: 'SCORE', regularCount: 4, periodsPerYear: 140 }).expect(200);
      const list = await api().get('/api/v1/grades/settings').set(admin()).expect(200);
      const toan = list.body.find((s: any) => s.code === 'TOAN');
      expect(toan).toMatchObject({ regularCount: 4, periodsPerYear: 140, suggestedRegularCount: 4 });
      await api().put(`/api/v1/grades/settings/${subjects.TOAN}`).set(admin()).send({ assessment: 'SCORE', regularCount: 0 }).expect(400);
    });
  });

  describe('gradebook', () => {
    it('shows the roster with empty mark slots', async () => {
      const res = await api().get('/api/v1/grades/book').query({ classId, subjectId: subjects.TOAN, semester: 1 }).set(teacher()).expect(200);
      expect(res.body.setting).toMatchObject({ assessment: 'SCORE', regularCount: 4 });
      expect(res.body.locked).toBe(false);
      expect(res.body.students).toHaveLength(3);
      expect(res.body.students[0]).toMatchObject({ fullName: 'Lê Minh Châu', marks: { TX: [null, null, null, null], GK: null, CK: null }, average: null });
    });

    it('saves marks and computes the weighted average', async () => {
      const id = students[0].student.id;
      const res = await saveBook(subjects.TOAN, 1, [
        { studentId: id, kind: 'TX', index: 1, value: 8 },
        { studentId: id, kind: 'TX', index: 2, value: 9 },
        { studentId: id, kind: 'TX', index: 3, value: 8 },
        { studentId: id, kind: 'TX', index: 4, value: 9 },
        { studentId: id, kind: 'GK', index: 1, value: 8 },
        { studentId: id, kind: 'CK', index: 1, value: 9, note: 'Tiến bộ' },
      ]).expect(200);
      const row = res.body.students.find((s: any) => s.id === id);
      // (8+9+8+9 + 2×8 + 3×9) / 9 = 77 / 9 = 8.56 -> 8.6
      expect(row).toMatchObject({ marks: { TX: [8, 9, 8, 9], GK: 8, CK: 9 }, average: 8.6, note: 'Tiến bộ' });
      const score = await prisma.score.findFirst({ where: { studentId: id, subjectId: subjects.TOAN, kind: 'CK' } });
      expect(score?.teacherId).toBe(teacherId);
      const again = await api().get('/api/v1/grades/book').query({ classId, subjectId: subjects.TOAN, semester: 1 }).set(staff()).expect(200);
      expect(again.body.students.find((s: any) => s.id === id).average).toBe(8.6);

      // Clearing a mark makes the average incomplete again; the note survives.
      const cleared = await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 4, value: null }]).expect(200);
      expect(cleared.body.students.find((s: any) => s.id === id)).toMatchObject({ marks: { TX: [8, 9, 8, null] }, average: null, note: 'Tiến bộ' });
    });

    it('rejects marks outside 0–10 in 0.1 steps, extra regular marks and strangers', async () => {
      const id = students[0].student.id;
      await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 1, value: 10.3 }]).expect(400);
      const res = await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 1, value: 7.25 }]).expect(400);
      expect(res.body.message).toBe('Điểm phải từ 0 đến 10 và là bội số của 0,1');
      const idx = await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 5, value: 7 }]).expect(400);
      expect(idx.body.message).toContain('4 điểm thường xuyên');
      await saveBook(subjects.VAN, 1, [{ studentId: id, kind: 'TX', index: 4, value: 7 }]).expect(400);
      await saveBook(subjects.TOAN, 1, [{ studentId: other.student.id, kind: 'TX', index: 1, value: 7 }]).expect(400);
      await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 1, value: 7, extra: true }]).expect(400);
    });

    it('records Đạt / Chưa đạt for comment subjects', async () => {
      const id = students[0].student.id;
      await saveBook(subjects.GDTC, 1, [{ studentId: id, kind: 'TX', index: 1, value: 8 }]).expect(400);
      const res = await saveBook(subjects.GDTC, 1, [
        { studentId: id, kind: 'TX', index: 1, passed: true },
        { studentId: id, kind: 'TX', index: 2, passed: true },
        { studentId: id, kind: 'GK', index: 1, passed: true },
        { studentId: id, kind: 'CK', index: 1, passed: true },
      ]).expect(200);
      expect(res.body.setting.assessment).toBe('COMMENT');
      expect(res.body.students.find((s: any) => s.id === id)).toMatchObject({ passed: { TX: [true, true], GK: true, CK: true }, passedResult: true, average: null });
      const failed = await saveBook(subjects.GDTC, 1, [{ studentId: id, kind: 'TX', index: 2, passed: false }]).expect(200);
      expect(failed.body.students.find((s: any) => s.id === id).passedResult).toBe(false);
      await saveBook(subjects.GDTC, 1, [{ studentId: id, kind: 'TX', index: 2, passed: true }]).expect(200);
    });

    it('locks and unlocks a semester (admin only)', async () => {
      const id = students[0].student.id;
      await api().post('/api/v1/grades/lock').set(teacher()).send({ classId, semester: 1 }).expect(403);
      await api().post('/api/v1/grades/lock').set(staff()).send({ classId, semester: 1 }).expect(403);
      const lock = await api().post('/api/v1/grades/lock').set(admin()).send({ classId, semester: 1 }).expect(200);
      expect(lock.body.locked).toBe(true);
      const book = await api().get('/api/v1/grades/book').query({ classId, subjectId: subjects.TOAN, semester: 1 }).set(teacher()).expect(200);
      expect(book.body.locked).toBe(true);
      const blocked = await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 4, value: 9 }]).expect(400);
      expect(blocked.body.message).toBe('Sổ điểm học kỳ này đã khóa');
      // Semester 2 is still open.
      await saveBook(subjects.TOAN, 2, [{ studentId: id, kind: 'TX', index: 1, value: 9 }]).expect(200);
      await api().delete('/api/v1/grades/lock').set(admin()).send({ classId, semester: 1 }).expect(200);
      await saveBook(subjects.TOAN, 1, [{ studentId: id, kind: 'TX', index: 4, value: 9 }]).expect(200);
    });

    it('exports the gradebook as CSV with a BOM', async () => {
      const res = await api().get('/api/v1/grades/book/export').query({ classId, subjectId: subjects.TOAN, semester: 1 }).set(teacher()).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
      expect(res.text).toContain('Sổ điểm môn Toán - Lớp 6A - Học kỳ 1');
      expect(res.text).toContain('TX1;TX2;TX3;TX4;GK;CK;ĐTB');
      expect(res.text).toContain('Nguyễn Văn An;8,0;9,0;8,0;9,0;8,0;9,0;8,6;Tiến bộ');
    });
  });

  describe('results', () => {
    const id = () => students[0].student.id;

    it('derives the academic level, keeps conduct and awards the title once conduct is in', async () => {
      // Every score subject at 8.5 in both semesters, GDTC Đạt: TOT in each term.
      for (const semester of [1, 2]) {
        for (const code of SCORE_SUBJECTS) await saveBook(subjects[code], semester, fullMarks(id(), 8.5, code === 'TOAN' ? 4 : 3)).expect(200);
        await saveBook(subjects.GDTC, semester, [
          { studentId: id(), kind: 'TX', index: 1, passed: true },
          { studentId: id(), kind: 'TX', index: 2, passed: true },
          { studentId: id(), kind: 'GK', index: 1, passed: true },
          { studentId: id(), kind: 'CK', index: 1, passed: true },
        ]).expect(200);
      }
      const hk1 = await api().post('/api/v1/grades/results/recompute').set(staff()).send({ classId, semester: 1 }).expect(200);
      const me = hk1.body.students.find((s: any) => s.id === id());
      expect(me).toMatchObject({ academic: 'TOT', conduct: null, title: null, promotion: null });
      expect(me.subjects.map((s: any) => s.code).slice(0, 2)).toEqual(['TOAN', 'VAN']);
      expect(me.subjects.find((s: any) => s.code === 'TOAN')).toMatchObject({ assessment: 'SCORE', average: 8.5, passed: null });
      expect(me.subjects.find((s: any) => s.code === 'GDTC')).toMatchObject({ assessment: 'COMMENT', average: null, passed: true });
      // Classmates without marks are still pending.
      expect(hk1.body.students.find((s: any) => s.id === students[1].student.id).academic).toBeNull();
      expect(hk1.body.summary.academic).toMatchObject({ TOT: 1, pending: 2 });

      const year = await api().get('/api/v1/grades/results').query({ classId, semester: 0 }).set(teacher()).expect(200);
      const mine = year.body.students.find((s: any) => s.id === id());
      expect(mine).toMatchObject({ academic: 'TOT', title: null, promotion: null });
      expect(mine.subjects.find((s: any) => s.code === 'TOAN').average).toBe(8.5);

      // The conduct module writes TermResult.conduct; a recompute keeps it and derives title and promotion.
      await prisma.termResult.update({ where: { studentId_academicYearId_semester: { studentId: id(), academicYearId: yearId, semester: 0 } }, data: { conduct: 'TOT' } });
      const after = await api().post('/api/v1/grades/results/recompute').set(admin()).send({ classId, semester: 0 }).expect(200);
      expect(after.body.students.find((s: any) => s.id === id())).toMatchObject({ academic: 'TOT', conduct: 'TOT', title: 'Học sinh Giỏi', promotion: 'PROMOTED' });
      expect(after.body.summary.titles['Học sinh Giỏi']).toBe(1);
      expect(after.body.summary.promotion).toMatchObject({ PROMOTED: 1, pending: 2 });
    });

    it('lets the office or the homeroom teacher edit absences, comment and promotion', async () => {
      const retained = await api().put(`/api/v1/grades/results/${id()}`).set(teacher()).send({ semester: 0, absentDays: 50, homeroomComment: 'Nghỉ nhiều' }).expect(200);
      expect(retained.body).toMatchObject({ absentDays: 50, homeroomComment: 'Nghỉ nhiều', promotion: 'RETAINED', title: 'Học sinh Giỏi' });
      const explicit = await api().put(`/api/v1/grades/results/${id()}`).set(staff()).send({ semester: 0, absentDays: 2, promotion: 'RETEST' }).expect(200);
      expect(explicit.body).toMatchObject({ absentDays: 2, homeroomComment: 'Nghỉ nhiều', promotion: 'RETEST' });
      await api().put(`/api/v1/grades/results/${id()}`).set(staff()).send({ semester: 1, promotion: 'PROMOTED' }).expect(400);
      // The TEACHER user is not 6B's homeroom teacher.
      await api().put(`/api/v1/grades/results/${other.student.id}`).set(teacher()).send({ semester: 0, absentDays: 1 }).expect(403);
      await api().put(`/api/v1/grades/results/${other.student.id}`).set(staff()).send({ semester: 0, absentDays: 1 }).expect(200);
    });

    it('exports results as CSV', async () => {
      const res = await api().get('/api/v1/grades/results/export').query({ classId, semester: 0 }).set(staff()).expect(200);
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
      expect(res.text).toContain('Kết quả học tập - Lớp 6A - Cả năm');
      expect(res.text).toContain('Nguyễn Văn An;8,5;8,5;8,5;8,5;8,5;8,5;8,5;Đạt;Tốt;Tốt;Học sinh Giỏi;Kiểm tra lại;2;Nghỉ nhiều');
    });

    it('builds the transcript', async () => {
      const res = await api().get(`/api/v1/grades/transcript/${id()}`).set(teacher()).expect(200);
      expect(res.body.student).toMatchObject({ id: id(), fullName: 'Nguyễn Văn An' });
      expect(res.body.class).toMatchObject({ id: classId, name: '6A' });
      expect(res.body.academicYear.id).toBe(yearId);
      expect(res.body.homeroomTeacher).toMatchObject({ id: teacherId, fullName: 'Nguyễn Thị Lan' });
      const toan = res.body.subjects.find((s: any) => s.code === 'TOAN');
      expect(toan).toMatchObject({ hk1: { average: 8.5 }, hk2: { average: 8.5 }, year: { average: 8.5 } });
      expect(res.body.subjects.find((s: any) => s.code === 'GDTC')).toMatchObject({ assessment: 'COMMENT', year: { passed: true } });
      expect(res.body.terms.hk1).toMatchObject({ academic: 'TOT' });
      expect(res.body.terms.year).toMatchObject({ academic: 'TOT', conduct: 'TOT', title: 'Học sinh Giỏi', promotion: 'RETEST', absentDays: 2 });
      await api().get(`/api/v1/grades/transcript/${id()}`).query({ academicYearId: 'nope' }).set(teacher()).expect(404);
    });
  });

  describe('student and parent apps', () => {
    it('shows a student their own marks (and nothing to staff)', async () => {
      const res = await api().get('/api/v1/student/grades').query({ semester: 1 }).set(bearer(students[0].token)).expect(200);
      expect(res.body.class.id).toBe(classId);
      const toan = res.body.subjects.find((s: any) => s.code === 'TOAN');
      expect(toan).toMatchObject({ marks: { TX: [8.5, 8.5, 8.5, 8.5], GK: 8.5, CK: 8.5 }, average: 8.5 });
      expect(res.body.subjects.find((s: any) => s.code === 'GDTC')).toMatchObject({ passedMarks: { GK: true, CK: true }, passed: true });
      expect(res.body.term).toMatchObject({ academic: 'TOT' });

      const year = await api().get('/api/v1/student/grades').query({ semester: 0 }).set(bearer(students[0].token)).expect(200);
      expect(year.body.subjects.find((s: any) => s.code === 'TOAN')).toMatchObject({ hk1: { average: 8.5 }, hk2: { average: 8.5 }, average: 8.5 });
      expect(year.body.term).toMatchObject({ title: 'Học sinh Giỏi', promotion: 'RETEST' });

      // A classmate without marks sees an empty list, not the catalogue.
      const empty = await api().get('/api/v1/student/grades').set(bearer(students[1].token)).expect(200);
      expect(empty.body.subjects).toEqual([]);
      await api().get('/api/v1/student/grades').set(staff()).expect(403);
    });

    it('shows a parent their child (and 404 for someone else)', async () => {
      const res = await api().get(`/api/v1/parent/children/${students[0].student.id}/grades`).query({ semester: 1 }).set(bearer(parent.token)).expect(200);
      expect(res.body.subjects.find((s: any) => s.code === 'TOAN').average).toBe(8.5);
      expect(res.body.term.academic).toBe('TOT');
      await api().get(`/api/v1/parent/children/${other.student.id}/grades`).set(bearer(parent.token)).expect(404);
      await api().get(`/api/v1/parent/children/${students[0].student.id}/grades`).set(teacher()).expect(403);
    });

    it('notifies the family and the student once per GK/CK change', async () => {
      const id = students[0].student.id;
      const count = (userId: string) => prisma.notification.count({ where: { userId, kind: 'GRADE_UPDATED' } });
      const before = await count(parent.user.id);
      const beforeOwn = await count(students[0].user.id);
      await saveBook(subjects.TOAN, 1, [
        { studentId: id, kind: 'TX', index: 1, value: 9 },
        { studentId: id, kind: 'GK', index: 1, value: 9 },
        { studentId: id, kind: 'CK', index: 1, value: 9.5 },
      ]).expect(200);
      expect(await count(parent.user.id)).toBe(before + 1);
      expect(await count(students[0].user.id)).toBe(beforeOwn + 1);
      const last = await prisma.notification.findFirst({ where: { userId: parent.user.id, kind: 'GRADE_UPDATED' }, orderBy: { createdAt: 'desc' } });
      expect(last).toMatchObject({ title: 'Cập nhật điểm', body: 'Điểm cuối kỳ môn Toán học kỳ 1: 9,5', studentId: id });
      // Same values again, or a regular mark only: no new alert.
      await saveBook(subjects.TOAN, 1, [
        { studentId: id, kind: 'CK', index: 1, value: 9.5 },
        { studentId: id, kind: 'TX', index: 2, value: 7 },
      ]).expect(200);
      expect(await count(parent.user.id)).toBe(before + 1);
      // A comment subject reports Đạt / Chưa đạt.
      await saveBook(subjects.GDTC, 1, [{ studentId: id, kind: 'CK', index: 1, passed: false }]).expect(200);
      const gdtc = await prisma.notification.findFirst({ where: { userId: parent.user.id, kind: 'GRADE_UPDATED' }, orderBy: { createdAt: 'desc' } });
      expect(gdtc?.body).toBe('Điểm cuối kỳ môn Giáo dục thể chất học kỳ 1: Chưa đạt');
    });
  });
});

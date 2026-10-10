import { INestApplication } from '@nestjs/common';
import { ResultLevel, ScoreKind } from '@prisma/client';
import request from 'supertest';
import { bearer, createApp, createSchool, createStudent, prisma, runId } from './helpers';

// The end of the school year: year conduct, retakes and summer training (Điều 12 to 14 TT22),
// the promotion that follows, the THCS completion review and the documents they print.
describe('End of the school year (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let yearId: string;
  let class6: string; // 6A, homeroom = the TEACHER user, who teaches Toán
  let class9: string; // 9A, homeroom = a teacher without an account
  let subjects: Record<string, string>;
  let good: string; // all 8.0, conduct Tốt
  let weak: string; // Toán 4.0: học tập Chưa đạt, retakes Toán
  let unruly: string; // conduct Chưa đạt both semesters: summer training
  let absent: string; // Toán 4.0 and 50 sessions absent: stays down
  let top9: string; // grade 9, everything fine
  let art9: string; // grade 9, Nghệ thuật at Chưa đạt
  let late9: string; // grade 9, dossier to complete
  let old9: string; // grade 9, born 2005
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

  /** Both semesters of marks: every score subject at its average (default 8.0), comment subjects Đạt unless failed. */
  async function mark(classId: string, studentId: string, averages: Record<string, number> = {}, failed: string[] = []) {
    const data = [];
    for (const semester of [1, 2]) {
      for (const code of ['TOAN', 'VAN', 'ANH']) {
        const value = averages[code] ?? 8;
        for (const [kind, index] of [[ScoreKind.TX, 1], [ScoreKind.TX, 2], [ScoreKind.GK, 1], [ScoreKind.CK, 1]] as const) {
          data.push({ schoolId, academicYearId: yearId, semester, classId, studentId, subjectId: subjects[code], kind, index, value });
        }
      }
      for (const code of ['GDTC', 'NT']) {
        for (const [kind, index] of [[ScoreKind.TX, 1], [ScoreKind.TX, 2], [ScoreKind.GK, 1], [ScoreKind.CK, 1]] as const) {
          data.push({ schoolId, academicYearId: yearId, semester, classId, studentId, subjectId: subjects[code], kind, index, passed: !(failed.includes(code) && kind === ScoreKind.CK) });
        }
      }
    }
    await prisma.score.createMany({ data });
  }

  /** Semester conduct as the conduct module writes it once approved, and the year's absences. */
  async function conduct(classId: string, studentId: string, hk1: ResultLevel, hk2: ResultLevel, absentDays = 0) {
    for (const [semester, level] of [[1, hk1], [2, hk2]] as const) {
      await prisma.termResult.create({ data: { schoolId, academicYearId: yearId, semester, classId, studentId, conduct: level } });
    }
    await prisma.termResult.create({ data: { schoolId, academicYearId: yearId, semester: 0, classId, studentId, absentDays } });
  }

  const yearRow = async (classId: string, studentId: string) => {
    const res = await api().get('/api/v1/grades/results').query({ classId, semester: 0 }).set(staff()).expect(200);
    return res.body.students.find((s: any) => s.id === studentId);
  };
  const retakeOf = async (studentId: string, code: string) => {
    const res = await api().get('/api/v1/grades/review/retakes').set(staff()).expect(200);
    return res.body.students.find((s: any) => s.id === studentId).retakes.find((r: any) => r.code === code);
  };

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `EY${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    await prisma.school.update({ where: { id: schoolId }, data: { governingBody: 'UBND phường Nghĩa Đô', principalName: 'Nguyễn Thị Hồng Hạnh', locality: 'Hà Nội' } });
    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    subjects = {};
    for (const [code, name] of [['TOAN', 'Toán'], ['VAN', 'Ngữ văn'], ['ANH', 'Tiếng Anh'], ['GDTC', 'Giáo dục thể chất'], ['NT', 'Nghệ thuật']]) {
      subjects[code] = (await prisma.subject.create({ data: { schoolId, code, name } })).id;
      await prisma.subjectSetting.create({ data: { schoolId, subjectId: subjects[code], assessment: ['GDTC', 'NT'].includes(code) ? 'COMMENT' : 'SCORE', regularCount: 2 } });
    }
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-ey${run}@test.vn`.toLowerCase() } });
    const gv1 = await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUser.id, subjects: { create: [{ subjectId: subjects.TOAN }] } } });
    const gv2 = await prisma.teacher.create({ data: { schoolId, code: 'GV2', fullName: 'Trần Văn Hùng' } });
    class6 = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '6A', gradeLevel: 6, homeroomTeacherId: gv1.id } })).id;
    class9 = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '9A', gradeLevel: 9, homeroomTeacherId: gv2.id } })).id;
    const student = async (classId: string, fullName: string, born?: string) => {
      const { student: s } = await createStudent(app, schoolId, { classId, fullName });
      if (born) await prisma.student.update({ where: { id: s.id }, data: { dateOfBirth: new Date(born), gender: 'FEMALE' } });
      return s.id;
    };

    good = await student(class6, 'Nguyễn Văn An');
    weak = await student(class6, 'Trần Thị Bình');
    unruly = await student(class6, 'Lê Minh Châu');
    absent = await student(class6, 'Phạm Quốc Dũng');
    await mark(class6, good);
    await mark(class6, weak, { TOAN: 4, VAN: 6, ANH: 6 });
    await mark(class6, unruly, { TOAN: 7, VAN: 7, ANH: 7 });
    await mark(class6, absent, { TOAN: 4, VAN: 6, ANH: 6 });
    await conduct(class6, good, 'KHA', 'TOT');
    await conduct(class6, weak, 'KHA', 'KHA', 3);
    await conduct(class6, unruly, 'CHUA_DAT', 'CHUA_DAT');
    await conduct(class6, absent, 'DAT', 'DAT', 50);

    top9 = await student(class9, 'Hoàng Thu Hà', '2012-03-14');
    art9 = await student(class9, 'Vũ Đức Minh', '2012-07-02');
    late9 = await student(class9, 'Đặng Thu Trang', '2012-11-20');
    old9 = await student(class9, 'Bùi Văn Nam', '2005-01-09');
    await mark(class9, top9);
    await mark(class9, art9, { TOAN: 7, VAN: 7, ANH: 7 }, ['NT']);
    await mark(class9, late9, { TOAN: 7, VAN: 7, ANH: 7 });
    await mark(class9, old9, { TOAN: 7, VAN: 7, ANH: 7 });
    for (const id of [top9, art9, late9, old9]) await conduct(class9, id, 'TOT', 'TOT', 2);

    for (const classId of [class6, class9]) await api().post('/api/v1/grades/results/recompute').set(staff()).send({ classId, semester: 0 }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('year results', () => {
    it('derives the year conduct from both semesters and sends one failed level to the summer review', async () => {
      expect(await yearRow(class6, good)).toMatchObject({ academic: 'TOT', conduct: 'TOT', title: 'Học sinh Giỏi', promotion: 'PROMOTED', review: null });
      expect(await yearRow(class6, weak)).toMatchObject({ academic: 'CHUA_DAT', conduct: 'KHA', promotion: 'RETEST', review: 'RETAKE', academicAfterRetake: null });
      expect(await yearRow(class6, unruly)).toMatchObject({ academic: 'KHA', conduct: 'CHUA_DAT', promotion: 'RETEST', review: 'TRAINING', conductAfterTraining: null });
      expect(await yearRow(class6, absent)).toMatchObject({ academic: 'CHUA_DAT', promotion: 'RETAINED' });
      // Đạt allows one comment subject at Chưa đạt.
      expect(await yearRow(class9, art9)).toMatchObject({ academic: 'DAT', conduct: 'TOT', promotion: 'PROMOTED' });
    });

    it('keeps a promotion set by hand until it is cleared', async () => {
      const set = await api().put(`/api/v1/grades/results/${absent}`).set(staff()).send({ semester: 0, promotion: 'PROMOTED' }).expect(200);
      expect(set.body).toMatchObject({ promotion: 'PROMOTED' });
      await api().post('/api/v1/grades/results/recompute').set(staff()).send({ classId: class6, semester: 0 }).expect(200);
      expect(await yearRow(class6, absent)).toMatchObject({ promotion: 'PROMOTED', promotionSetByHand: true });
      const cleared = await api().put(`/api/v1/grades/results/${absent}`).set(staff()).send({ semester: 0, promotion: null }).expect(200);
      expect(cleared.body).toMatchObject({ promotion: 'RETAINED' });
      expect(await yearRow(class6, absent)).toMatchObject({ promotion: 'RETAINED', promotionSetByHand: false });
    });
  });

  describe('retakes', () => {
    it('lists who must retake and which subjects they may retake', async () => {
      const res = await api().get('/api/v1/grades/review/retakes').set(teacher()).expect(200);
      // Too many absences: no retake; the grade 9 student retakes Nghệ thuật for the completion review.
      expect(res.body.students.map((s: any) => [s.fullName, s.reason, s.eligible.map((e: any) => e.code)])).toEqual([
        ['Trần Thị Bình', 'PROMOTION', ['TOAN']],
        ['Vũ Đức Minh', 'COMPLETION', ['NT']],
      ]);
      expect(res.body.students[0].eligible[0]).toMatchObject({ name: 'Toán', average: 4 });
      expect(res.body.summary).toMatchObject({ students: 2, unregistered: 2, subjects: 0, entered: 0 });
      const grade9 = await api().get('/api/v1/grades/review/retakes').query({ gradeLevel: 9 }).set(staff()).expect(200);
      expect(grade9.body.students).toHaveLength(1);
    });

    it('registers subjects (office only)', async () => {
      await api().put(`/api/v1/grades/review/retakes/${weak}`).set(teacher()).send({ subjectIds: [subjects.TOAN] }).expect(403);
      const wrong = await api().put(`/api/v1/grades/review/retakes/${weak}`).set(staff()).send({ subjectIds: [subjects.VAN] }).expect(400);
      expect(wrong.body.message).toBe('Có môn không thuộc diện kiểm tra lại của học sinh');
      const none = await api().put(`/api/v1/grades/review/retakes/${good}`).set(staff()).send({ subjectIds: [subjects.TOAN] }).expect(400);
      expect(none.body.message).toBe('Học sinh không thuộc diện kiểm tra lại');
      const res = await api().put(`/api/v1/grades/review/retakes/${weak}`).set(staff()).send({ subjectIds: [subjects.TOAN] }).expect(200);
      expect(res.body.retakes).toEqual([expect.objectContaining({ code: 'TOAN', yearAverage: 4, score: null, entered: false })]);
      // The rest of the list in one go.
      const all = await api().post('/api/v1/grades/review/retakes/register').set(admin()).send({}).expect(200);
      expect(all.body).toEqual({ students: 1, subjects: 1 });
      expect(await retakeOf(art9, 'NT')).toMatchObject({ assessment: 'COMMENT', yearPassed: false, passed: null });
    });

    it('lets teachers enter results for the subjects they teach, and recomputes promotion', async () => {
      const toan = await retakeOf(weak, 'TOAN');
      const nt = await retakeOf(art9, 'NT');
      const foreign = await api().put('/api/v1/grades/review/retakes/results').set(teacher()).send({ entries: [{ retakeId: nt.id, passed: true }] }).expect(403);
      expect(foreign.body.message).toContain('môn mình dạy (Nghệ thuật)');
      await api().put('/api/v1/grades/review/retakes/results').set(staff()).send({ entries: [{ retakeId: nt.id, score: 7 }] }).expect(400);
      await api().put('/api/v1/grades/review/retakes/results').set(staff()).send({ entries: [{ retakeId: toan.id, passed: true }] }).expect(400);
      await api().put('/api/v1/grades/review/retakes/results').set(teacher()).send({ entries: [{ retakeId: toan.id, score: 10.5 }] }).expect(400);

      // 4.5 still leaves learning at Chưa đạt: stays down.
      await api().put('/api/v1/grades/review/retakes/results').set(teacher()).send({ entries: [{ retakeId: toan.id, score: 4.5 }] }).expect(200);
      expect(await yearRow(class6, weak)).toMatchObject({ academicAfterRetake: 'CHUA_DAT', promotion: 'RETAINED' });
      await api().put('/api/v1/grades/review/retakes/results').set(teacher()).send({ entries: [{ retakeId: toan.id, score: 6, note: 'Thi lại ngày 20/6' }] }).expect(200);
      expect(await yearRow(class6, weak)).toMatchObject({ academicAfterRetake: 'DAT', promotion: 'PROMOTED', review: null });
      expect(await retakeOf(weak, 'TOAN')).toMatchObject({ score: 6, note: 'Thi lại ngày 20/6', entered: true });
      // Clearing the mark puts the student back on RETEST.
      await api().put('/api/v1/grades/review/retakes/results').set(staff()).send({ entries: [{ retakeId: toan.id, score: null }] }).expect(200);
      expect(await yearRow(class6, weak)).toMatchObject({ academicAfterRetake: null, promotion: 'RETEST' });
      await api().put('/api/v1/grades/review/retakes/results').set(staff()).send({ entries: [{ retakeId: toan.id, score: 6 }] }).expect(200);

      const list = await api().get('/api/v1/grades/review/retakes').set(staff()).expect(200);
      expect(list.body.summary).toMatchObject({ students: 2, unregistered: 0, subjects: 2, entered: 1, promoted: 1, retained: 0 });
    });

    it('keeps subjects that already have a result', async () => {
      const res = await api().put(`/api/v1/grades/review/retakes/${weak}`).set(staff()).send({ subjectIds: [] }).expect(400);
      expect(res.body.message).toContain('Không bỏ được môn đã có kết quả');
    });
  });

  describe('summer training', () => {
    it('lists students whose year conduct is Chưa đạt', async () => {
      const res = await api().get('/api/v1/grades/review/training').set(teacher()).expect(200);
      expect(res.body.students).toEqual([expect.objectContaining({ id: unruly, conduct: 'CHUA_DAT', decides: true, training: null })]);
      expect(res.body.summary).toMatchObject({ students: 1, assigned: 0, evaluated: 0 });
    });

    it('lets the homeroom teacher set the tasks and re-evaluate conduct', async () => {
      const tasks = 'Lao động vệ sinh khu dân cư 2 buổi mỗi tuần';
      await api().put(`/api/v1/grades/review/training/${top9}`).set(teacher()).send({ tasks }).expect(403);
      const notDue = await api().put(`/api/v1/grades/review/training/${good}`).set(staff()).send({ tasks }).expect(400);
      expect(notDue.body.message).toContain('Chưa đạt');
      const set = await api().put(`/api/v1/grades/review/training/${unruly}`).set(teacher()).send({ tasks }).expect(200);
      expect(set.body).toMatchObject({ promotion: 'RETEST', training: { tasks, result: null } });

      const failedAgain = await api().put(`/api/v1/grades/review/training/${unruly}`).set(teacher()).send({ tasks, result: 'CHUA_DAT' }).expect(200);
      expect(failedAgain.body).toMatchObject({ conductAfterTraining: 'CHUA_DAT', promotion: 'RETAINED' });
      const passed = await api().put(`/api/v1/grades/review/training/${unruly}`).set(teacher()).send({ tasks, result: 'DAT', comment: 'Tiến bộ rõ' }).expect(200);
      expect(passed.body).toMatchObject({ conductAfterTraining: 'DAT', promotion: 'PROMOTED', training: { result: 'DAT', comment: 'Tiến bộ rõ' } });
    });

    it('removes a training (office only)', async () => {
      await api().delete(`/api/v1/grades/review/training/${unruly}`).set(teacher()).expect(403);
      await api().delete(`/api/v1/grades/review/training/${unruly}`).set(staff()).expect(200);
      expect(await yearRow(class6, unruly)).toMatchObject({ conductAfterTraining: null, promotion: 'RETEST' });
      await api().delete(`/api/v1/grades/review/training/${unruly}`).set(staff()).expect(404);
      await api().put(`/api/v1/grades/review/training/${unruly}`).set(staff()).send({ tasks: 'Tự kiểm điểm hằng tuần', result: 'DAT' }).expect(200);
    });
  });

  describe('promotion after the review', () => {
    it('counts each class and explains who was not promoted outright', async () => {
      const res = await api().get('/api/v1/grades/review/promotion').query({ classId: class6 }).set(staff()).expect(200);
      expect(res.body.classes).toEqual([expect.objectContaining({ name: '6A', students: 4, promoted: 1, afterReview: 2, retest: 0, retained: 1, pending: 0 })]);
      expect(Object.fromEntries(res.body.students.map((s: any) => [s.fullName, s.reason]))).toEqual({
        'Trần Thị Bình': 'Lên lớp sau kiểm tra lại Toán',
        'Lê Minh Châu': 'Lên lớp sau rèn luyện hè',
        'Phạm Quốc Dũng': 'Nghỉ 50 buổi (quá 45 buổi)',
      });
    });
  });

  describe('THCS completion', () => {
    it('checks every grade 9 student against the conditions', async () => {
      const res = await api().get('/api/v1/grades/completion').query({ round: 1 }).set(teacher()).expect(200);
      expect(res.body.academicYear).toMatchObject({ name: '2026-2027', reviewYear: 2027 });
      expect(res.body.round).toMatchObject({ round: 1, saved: false, members: [], recognizedAt: null });
      const byName = Object.fromEntries(res.body.students.map((s: any) => [s.fullName, s]));
      expect(byName['Hoàng Thu Hà']).toMatchObject({ eligible: true, gaps: [], age: 15, academic: 'TOT', conduct: 'TOT' });
      expect(byName['Vũ Đức Minh']).toMatchObject({ eligible: false, gaps: ['Chưa đạt môn Nghệ thuật'], failedSubjects: ['Nghệ thuật'] });
      expect(byName['Bùi Văn Nam']).toMatchObject({ eligible: false, gaps: ['Quá 21 tuổi'], age: 22 });
      expect(res.body.summary).toEqual({ students: 4, eligible: 2, notEligible: 2, recognized: 0 });
      await api().get('/api/v1/grades/completion').query({ round: 3 }).set(teacher()).expect(400);
    });

    it('records the dossier and priority group (office only)', async () => {
      await api().put(`/api/v1/grades/completion/students/${late9}`).set(teacher()).send({ dossierComplete: false }).expect(403);
      const res = await api().put(`/api/v1/grades/completion/students/${late9}`).set(staff()).send({ dossierComplete: false, priority: 'Con liệt sĩ', note: 'Thiếu học bạ lớp 6' }).expect(200);
      expect(res.body).toMatchObject({ dossierComplete: false, priority: 'Con liệt sĩ', note: 'Thiếu học bạ lớp 6', gaps: ['Hồ sơ chưa đủ'], eligible: false });
      await api().put(`/api/v1/grades/completion/students/${good}`).set(staff()).send({ dossierComplete: true }).expect(404);
    });

    it('saves the council of a round', async () => {
      const council = {
        councilDecisionNo: '15/QĐ-THCS',
        councilDecidedOn: '2027-05-05',
        meetingAt: '2027-05-18T08:00:00+07:00',
        meetingPlace: 'Phòng họp Hội đồng sư phạm',
        members: [
          { name: 'Nguyễn Thị Hồng Hạnh', position: 'Hiệu trưởng', role: 'Chủ tịch' },
          { name: 'Nguyễn Thị Lan', position: 'Tổ trưởng tổ Toán', role: 'Ủy viên' },
          { name: 'Trần Văn Hùng', position: 'Giáo viên', role: 'Thư ký' },
        ],
      };
      await api().put('/api/v1/grades/completion/rounds/1').set(teacher()).send(council).expect(403);
      await api().put('/api/v1/grades/completion/rounds/3').set(staff()).send(council).expect(400);
      const res = await api().put('/api/v1/grades/completion/rounds/1').set(staff()).send(council).expect(200);
      expect(res.body.round).toMatchObject({ round: 1, saved: true, councilDecisionNo: '15/QĐ-THCS', meetingPlace: 'Phòng họp Hội đồng sư phạm' });
      expect(res.body.round.members).toHaveLength(3);
      // Round 2 starts from the same council.
      const second = await api().get('/api/v1/grades/completion').query({ round: 2 }).set(staff()).expect(200);
      expect(second.body.round).toMatchObject({ round: 2, saved: false });
      expect(second.body.round.members).toHaveLength(3);
    });

    it('recognises the eligible students of round 1, then the rest in round 2', async () => {
      const decision = await api().get('/api/v1/reports/completion-decision').query({ round: 1 }).set(admin()).expect(400);
      expect(decision.body.message).toBe('Đợt 1 chưa có quyết định công nhận');
      const early = await api().post('/api/v1/grades/completion/rounds/2/recognize').set(admin()).send({ decisionNo: '30/QĐ-HĐXCN', decidedOn: '2027-08-15' }).expect(400);
      expect(early.body.message).toBe('Cần công nhận đợt 1 trước khi xét đợt 2');
      await api().post('/api/v1/grades/completion/rounds/1/recognize').set(staff()).send({ decisionNo: '25/QĐ-HĐXCN', decidedOn: '2027-05-25' }).expect(403);
      const first = await api().post('/api/v1/grades/completion/rounds/1/recognize').set(admin()).send({ decisionNo: '25/QĐ-HĐXCN', decidedOn: '2027-05-25' }).expect(200);
      expect(first.body).toEqual({ recognized: 1, firstRegisterNo: 1 });
      await api().post('/api/v1/grades/completion/rounds/1/recognize').set(admin()).send({ decisionNo: '25/QĐ-HĐXCN', decidedOn: '2027-05-25' }).expect(400);
      const after = await api().get('/api/v1/grades/completion').query({ round: 1 }).set(staff()).expect(200);
      // The chair of the council signs unless someone else is named.
      expect(after.body.round).toMatchObject({ decisionNo: '25/QĐ-HĐXCN', decidedOn: '2027-05-25T00:00:00.000Z', signerTitle: 'Chủ tịch Hội đồng', signerName: 'Nguyễn Thị Hồng Hạnh' });
      expect(after.body.students.find((s: any) => s.id === top9).recognized).toMatchObject({ round: 1, decisionNo: '25/QĐ-HĐXCN', registerNo: 1 });

      // Over the summer: Nghệ thuật passed on retake and the dossier completed.
      const nt = await retakeOf(art9, 'NT');
      await api().put('/api/v1/grades/review/retakes/results').set(staff()).send({ entries: [{ retakeId: nt.id, passed: true }] }).expect(200);
      await api().put(`/api/v1/grades/completion/students/${late9}`).set(staff()).send({ dossierComplete: true }).expect(200);
      const second = await api().post('/api/v1/grades/completion/rounds/2/recognize').set(admin()).send({ decisionNo: '30/QĐ-HĐXCN', decidedOn: '2027-08-15' }).expect(200);
      expect(second.body).toEqual({ recognized: 2, firstRegisterNo: 2 });

      // Only the latest decision can be withdrawn.
      const blocked = await api().delete('/api/v1/grades/completion/rounds/1/recognize').set(admin()).expect(400);
      expect(blocked.body.message).toBe('Cần hủy công nhận đợt 2 trước');
      await api().delete('/api/v1/grades/completion/rounds/2/recognize').set(staff()).expect(403);
      expect((await api().delete('/api/v1/grades/completion/rounds/2/recognize').set(admin()).expect(200)).body).toEqual({ cancelled: 2 });
      expect((await api().post('/api/v1/grades/completion/rounds/2/recognize').set(admin()).send({ decisionNo: '30/QĐ-HĐXCN', decidedOn: '2027-08-15' }).expect(200)).body).toEqual({ recognized: 2, firstRegisterNo: 2 });
      const overview = await api().get('/api/v1/grades/completion').query({ round: 2 }).set(staff()).expect(200);
      expect(overview.body.summary).toEqual({ students: 4, eligible: 0, notEligible: 1, recognized: 3 });
      expect(overview.body.rounds.map((r: any) => [r.round, r.recognized])).toEqual([[1, 1], [2, 2]]);
    });

    it('confirms completion and the summer review in the học bạ', async () => {
      const top = await api().get(`/api/v1/grades/transcript/${top9}`).set(teacher()).expect(200);
      expect(top.body.completion).toMatchObject({ round: 1, decisionNo: '25/QĐ-HĐXCN', registerNo: 1, signerName: 'Nguyễn Thị Hồng Hạnh' });
      const art = await api().get(`/api/v1/grades/transcript/${art9}`).set(teacher()).expect(200);
      expect(art.body.retakes).toEqual([expect.objectContaining({ name: 'Nghệ thuật', assessment: 'COMMENT', passed: true })]);
      const trained = await api().get(`/api/v1/grades/transcript/${unruly}`).set(teacher()).expect(200);
      expect(trained.body.training).toMatchObject({ tasks: 'Tự kiểm điểm hằng tuần', result: 'DAT' });
      expect(trained.body.completion).toBeNull();
    });
  });

  describe('documents', () => {
    it('builds every end-of-year report as a preview and as PDF and Excel', async () => {
      const params: Record<string, Record<string, unknown>> = {
        retakes: {},
        'summer-training': { classId: class6 },
        'award-certificates': {},
        'completion-proposed': { round: 1 },
        'completion-not-eligible': { round: 2 },
        'completion-minutes': { round: 1 },
        'completion-decision': { round: 2 },
        'completion-certificates': { classId: class9 },
      };
      const catalogue = await api().get('/api/v1/reports').set(admin()).expect(200);
      const keys = catalogue.body.filter((r: any) => ['Cuối năm học', 'Hoàn thành chương trình THCS'].includes(r.group)).map((r: any) => r.key);
      expect(keys.sort()).toEqual(Object.keys(params).sort());
      for (const key of keys) {
        const json = await api().get(`/api/v1/reports/${key}`).query(params[key]).set(admin());
        expect([key, json.status]).toEqual([key, 200]);
        const pdf = await api().get(`/api/v1/reports/${key}`).query({ ...params[key], format: 'pdf' }).set(admin()).buffer(true).parse(binary).expect(200);
        expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
        const xlsx = await api().get(`/api/v1/reports/${key}`).query({ ...params[key], format: 'xlsx' }).set(admin()).buffer(true).parse(binary).expect(200);
        expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
      }
    });

    it('prints the lists with their results', async () => {
      const retakes = await api().get('/api/v1/reports/retakes').set(teacher()).expect(200);
      const rows = retakes.body.document.blocks[0].rows;
      expect(rows[0]).toEqual([1, 'Trần Thị Bình', '6A', 'Toán', '4,0', '6,0', 'Đạt', 'Được lên lớp', 'Thi lại ngày 20/6']);
      // Passing the retake lifts Nghệ thuật, so learning is re-rated Khá.
      expect(rows[1]).toEqual([2, 'Vũ Đức Minh', '9A', 'Nghệ thuật', 'Chưa đạt', 'Đạt', 'Khá', 'Hoàn thành chương trình THCS', '']);

      const proposed = await api().get('/api/v1/reports/completion-proposed').query({ round: 2 }).set(teacher()).expect(200);
      expect(proposed.body.document.subtitles).toEqual(['Năm học 2026-2027, đợt 2', 'Đã được công nhận theo Quyết định số 30/QĐ-HĐXCN ngày 15/08/2027']);
      expect(proposed.body.document.blocks[0].rows.map((r: any[]) => r[1])).toEqual(['Đặng Thu Trang', 'Vũ Đức Minh']);
      expect(proposed.body.document.signer).toEqual({ title: 'Chủ tịch Hội đồng', name: 'Nguyễn Thị Hồng Hạnh' });

      const missing = await api().get('/api/v1/reports/completion-not-eligible').query({ round: 2 }).set(teacher()).expect(200);
      expect(missing.body.document.blocks[0].rows).toEqual([[1, 'Bùi Văn Nam', '09/01/2005', '9A', 'Tốt', 'Khá', 2, 'Quá 21 tuổi']]);
      await api().get('/api/v1/reports/completion-proposed').set(teacher()).expect(400);
    });

    it('prints a decided round as it was decided, whatever the summer changed', async () => {
      // Recognised in round 2 since, the two students round 1 left out are still on its list with the reasons of the day.
      const missing = await api().get('/api/v1/reports/completion-not-eligible').query({ round: 1 }).set(teacher()).expect(200);
      expect(missing.body.document.blocks[0].rows.map((r: any[]) => [r[1], r[5], r[7]])).toEqual([
        ['Bùi Văn Nam', 'Khá', 'Quá 21 tuổi'],
        ['Đặng Thu Trang', 'Khá', 'Hồ sơ chưa đủ'],
        ['Vũ Đức Minh', 'Đạt', 'Chưa đạt môn Nghệ thuật'],
      ]);
      const minutes = await api().get('/api/v1/reports/completion-minutes').query({ round: 1 }).set(admin()).expect(200);
      expect(minutes.body.document.blocks[3].lines).toEqual([
        expect.stringContaining('của 4 học sinh'),
        expect.stringContaining('1 học sinh (25%)'),
        'Số học sinh chưa đủ điều kiện: 3 học sinh, theo Danh sách 2 kèm theo.',
      ]);
    });

    it('prints the minutes, the decision and one paper per student', async () => {
      const minutes = await api().get('/api/v1/reports/completion-minutes').query({ round: 1 }).set(admin()).expect(200);
      expect(minutes.body.document.blocks[0].lines[0]).toBe('Thời gian: 08 giờ 00, ngày 18/05/2027.');
      expect(minutes.body.document.cosigner).toEqual({ title: 'Thư ký', name: 'Trần Văn Hùng' });

      const decision = await api().get('/api/v1/reports/completion-decision').query({ round: 1 }).set(admin()).expect(200);
      const doc = decision.body.document;
      expect(doc).toMatchObject({ number: 'Số: 25/QĐ-HĐXCN', title: 'Quyết định', dateAtTop: true, subtitleStyle: 'bold' });
      expect(doc.footnote).toContain('- UBND phường Nghĩa Đô (Phòng Văn hóa - Xã hội);');
      expect(doc.pages).toHaveLength(1);
      expect(doc.pages[0].blocks[0].rows).toEqual([[1, 1, 'Hoàng Thu Hà', '14/03/2012', 'Nữ', '9A', 'Tốt', 'Tốt', '']]);

      const papers = await api().get('/api/v1/reports/completion-certificates').query({ classId: class9 }).set(admin()).expect(200);
      expect(papers.body.document.pdf).toBe('pages');
      expect(papers.body.document.pages.map((p: any) => p.number)).toEqual(['Số: 1/GXN', 'Số: 2/GXN', 'Số: 3/GXN']);
      const one = await api().get('/api/v1/reports/completion-certificates').query({ studentId: old9 }).set(admin()).expect(400);
      expect(one.body.message).toBe('Học sinh chưa được công nhận hoàn thành chương trình THCS');

      const awards = await api().get('/api/v1/reports/award-certificates').set(admin()).expect(200);
      expect(awards.body.document.blocks[0].rows.map((r: any[]) => [r[2], r[5]])).toEqual([
        ['Nguyễn Văn An', 'Học sinh Giỏi'],
        ['Hoàng Thu Hà', 'Học sinh Giỏi'],
      ]);
      expect(awards.body.document.pages[1].footnote).toEqual(['Số vào sổ: 2/GK']);
    });
  });
});

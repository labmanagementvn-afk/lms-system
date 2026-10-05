import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createClass, createSchool, createStudent, prisma, runId } from './helpers';

// Question bank, tests / contests, student attempts, grading and leaderboards against a real Postgres.
describe('Assessments (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let subjectId: string;
  let classId: string;
  let classId2: string;
  let s1: Awaited<ReturnType<typeof createStudent>>;
  let s2: typeof s1;
  let s3: typeof s1;
  let s4: typeof s1; // another class
  const run = runId();
  const api = () => request(app.getHttpServer());
  const teacher = () => bearer(tokens.TEACHER);
  const staff = () => bearer(tokens.STAFF);

  const q: Record<string, string> = {}; // question ids by name
  const choices = (...texts: string[]) => texts.map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `AS${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `AO${run}`)).tokens;
    subjectId = (await prisma.subject.create({ data: { schoolId, code: 'TOAN', name: 'Toán' } })).id;
    classId = (await createClass(schoolId, '6A1')).id;
    classId2 = (await createClass(schoolId, '6A2')).id;
    s1 = await createStudent(app, schoolId, { classId, fullName: 'Nguyễn An' });
    s2 = await createStudent(app, schoolId, { classId, fullName: 'Trần Bình' });
    s3 = await createStudent(app, schoolId, { classId, fullName: 'Lê Châu' });
    s4 = await createStudent(app, schoolId, { classId: classId2, fullName: 'Phạm Dũng' });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('question bank', () => {
    it('creates one question of every type and validates the answer per type', async () => {
      const create = (body: Record<string, unknown>) => api().post('/api/v1/lms/questions').set(teacher()).send({ subjectId, gradeLevel: 6, difficulty: 1, ...body });
      q.single = (await create({ type: 'SINGLE_CHOICE', content: '1/2 + 1/2 = ?', options: choices('1', '2', '1/4'), answer: { key: 'A' }, tags: ['phân số'] }).expect(201)).body.id;
      q.multi = (await create({ type: 'MULTIPLE_CHOICE', content: 'Số chẵn?', options: choices('2', '3', '4'), answer: { keys: ['A', 'C'] }, difficulty: 2 }).expect(201)).body.id;
      q.tf = (await create({ type: 'TRUE_FALSE', content: '2 là số nguyên tố', answer: { value: true } }).expect(201)).body.id;
      q.blank = (await create({ type: 'FILL_BLANK', content: '3 + ___ = 5; 5 - ___ = 1', answer: { blanks: [['2', 'hai'], ['4']] }, difficulty: 3 }).expect(201)).body.id;
      q.short = (await create({ type: 'SHORT_ANSWER', content: 'Thủ đô Việt Nam?', answer: { accepted: ['Hà Nội'] } }).expect(201)).body.id;
      q.num = (await create({ type: 'NUMERIC', content: '7 × 8 = ?', answer: { value: 56 } }).expect(201)).body.id;
      q.match = (
        await create({
          type: 'MATCHING',
          content: 'Ghép phân số với số thập phân',
          options: { left: [{ key: 'L1', text: '1/2' }, { key: 'L2', text: '1/4' }], right: [{ key: 'R1', text: '0,5' }, { key: 'R2', text: '0,25' }] },
          answer: { pairs: { L1: 'R1', L2: 'R2' } },
        }).expect(201)
      ).body.id;
      q.order = (await create({ type: 'ORDERING', content: 'Sắp xếp tăng dần', options: choices('3', '1', '2'), answer: { order: ['B', 'C', 'A'] } }).expect(201)).body.id;
      const essay = await create({ type: 'ESSAY', content: 'Trình bày cách cộng hai phân số', difficulty: 5 }).expect(201);
      q.essay = essay.body.id;
      expect(essay.body.answer).toBeNull();
      expect(essay.body.usedIn).toBe(0);

      // Bad answers are refused with a readable 400.
      const bad = await create({ type: 'SINGLE_CHOICE', content: 'x', options: choices('1', '2'), answer: { key: 'Z' } }).expect(400);
      expect(bad.body.message).toMatch(/phương án/);
      await create({ type: 'MULTIPLE_CHOICE', content: 'x', options: choices('1', '2'), answer: { keys: [] } }).expect(400);
      await create({ type: 'FILL_BLANK', content: 'no blanks here', answer: { blanks: [['1']] } }).expect(400);
      await create({ type: 'NUMERIC', content: 'x', answer: { value: 'abc' } }).expect(400);
      await create({ type: 'TRUE_FALSE', content: 'x', answer: { value: 'maybe' } }).expect(400);
      await create({ type: 'MATCHING', content: 'x', options: { left: choices('a', 'b'), right: choices('c', 'd') }, answer: { pairs: { A: 'A' } } }).expect(400);
      await create({ type: 'SINGLE_CHOICE', content: 'x', options: choices('1', '2'), answer: { key: 'A' }, subjectId: 'nope' }).expect(400);
    });

    it('lists with filters, returns tags, updates and deletes', async () => {
      const list = await api().get('/api/v1/lms/questions').set(teacher()).query({ type: 'SINGLE_CHOICE', tag: 'phân số' }).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].subject.code).toBe('TOAN');
      const search = await api().get('/api/v1/lms/questions').set(teacher()).query({ q: 'thủ đô' }).expect(200);
      expect(search.body.items.map((i: any) => i.id)).toEqual([q.short]);
      const tags = await api().get('/api/v1/lms/questions/tags').set(teacher()).expect(200);
      expect(tags.body).toContain('phân số');

      // The answer is re-validated against the new content on update.
      await api().patch(`/api/v1/lms/questions/${q.blank}`).set(teacher()).send({ content: 'only ___ one' }).expect(400);
      const upd = await api().patch(`/api/v1/lms/questions/${q.blank}`).set(teacher()).send({ content: '3 + ___ = 5 và 5 - ___ = 1', tags: ['chương 1'] }).expect(200);
      expect(upd.body.tags).toEqual(['chương 1']);

      const tmp = (await api().post('/api/v1/lms/questions').set(teacher()).send({ type: 'TRUE_FALSE', content: 'tmp', answer: { value: false } }).expect(201)).body.id;
      expect((await api().delete(`/api/v1/lms/questions/${tmp}`).set(teacher()).expect(200)).body.deleted).toBe(true);
      await api().get(`/api/v1/lms/questions/${tmp}`).set(teacher()).expect(404);

      // Other school: 404; students: 403.
      await api().get(`/api/v1/lms/questions/${q.single}`).set(bearer(otherTokens.TEACHER)).expect(404);
      await api().get('/api/v1/lms/questions').set(bearer(s1.token)).expect(403);
    });

    it('imports CSV, reporting the bad line, and exports with a BOM', async () => {
      const csv = [
        'type,content,optionA,optionB,optionC,optionD,answer,difficulty,subjectCode,gradeLevel,tags,explanation',
        'SINGLE_CHOICE,"2 + 2 = ?",3,4,5,,B,1,TOAN,6,chương 1;cộng,"4, tất nhiên"',
        'MULTIPLE_CHOICE,Số lẻ?,1,2,3,,A;C,2,TOAN,6,,',
        'TRUE_FALSE,0 là số tự nhiên,,,,,đúng,1,TOAN,6,,',
        'SHORT_ANSWER,Tác giả Truyện Kiều?,,,,,Nguyễn Du;nguyen du,2,,6,văn học,',
        'NUMERIC,"Giá trị của 1,5 × 2?",,,,,"3",1,TOAN,6,,',
        'SINGLE_CHOICE,Thiếu đáp án,1,2,,,Z,1,TOAN,6,,',
        'ESSAY,Viết đoạn văn về mùa thu,,,,,,4,,6,,',
      ].join('\r\n');
      const res = await api().post('/api/v1/lms/questions/import').set(teacher()).send({ csv }).expect(200);
      expect(res.body.created).toBe(6);
      expect(res.body.errors).toEqual([{ line: 7, message: expect.stringMatching(/phương án/) }]);

      const exp = await api().get('/api/v1/lms/questions/export').set(teacher()).query({ type: 'NUMERIC' }).expect(200);
      expect(exp.headers['content-type']).toMatch(/text\/csv/);
      expect(exp.text.charCodeAt(0)).toBe(0xfeff);
      expect(exp.text).toContain('NUMERIC,"Giá trị của 1,5 × 2?"');
      expect(exp.text).toContain(',3,1,TOAN,6,,');
      await api().post('/api/v1/lms/questions/import').set(teacher()).send({ csv: 'foo,bar\n1,2' }).expect(400);
    });
  });

  describe('tests', () => {
    let testId: string;
    let attemptId: string;
    const answers = () => ({
      [q.single]: { key: 'A' },
      [q.multi]: { keys: ['C', 'A'] },
      [q.tf]: { value: true },
      [q.blank]: { blanks: ['hai', '3'] }, // half right
      [q.short]: { text: 'ha noi' },
      [q.num]: { value: '56' },
      [q.match]: { pairs: { L1: 'R1', L2: 'R1' } }, // half right
      [q.order]: { order: ['B', 'C', 'A'] },
    });

    it('creates a test, assigns questions, and publishes with notifications to the class', async () => {
      const created = await api()
        .post('/api/v1/lms/tests')
        .set(teacher())
        .send({ kind: 'QUIZ', title: 'Kiểm tra 15 phút', subjectId, gradeLevel: 6, timeLimitMin: 15, maxAttempts: 2, shuffleQuestions: true, shuffleOptions: true, passPercent: 50, classIds: [classId] })
        .expect(201);
      testId = created.body.id;
      expect(created.body.status).toBe('DRAFT');
      expect(created.body.questionCount).toBe(0);
      await api().post('/api/v1/lms/tests').set(teacher()).send({ title: 'x', classIds: ['nope'] }).expect(400);
      await api().post('/api/v1/lms/tests').set(teacher()).send({ title: 'x', openAt: '2026-10-10T00:00:00Z', closeAt: '2026-10-09T00:00:00Z' }).expect(400);

      // Needs at least one question to publish.
      await api().post(`/api/v1/lms/tests/${testId}/publish`).set(teacher()).expect(400);
      const names = ['single', 'multi', 'tf', 'blank', 'short', 'num', 'match', 'order'];
      const set = await api()
        .put(`/api/v1/lms/tests/${testId}/questions`)
        .set(teacher())
        .send({ questions: names.map((n) => ({ questionId: q[n], points: n === 'blank' || n === 'match' ? 2 : 1 })) })
        .expect(200);
      expect(set.body.questionCount).toBe(8);
      expect(set.body.maxScore).toBe(10);
      expect(set.body.questions[0].question.answer).toEqual({ key: 'A' }); // keys are visible to the portal
      expect((await api().get(`/api/v1/lms/questions/${q.single}`).set(teacher()).expect(200)).body.usedIn).toBe(1);

      // Random fill: only ESSAY (difficulty 5) and the imported ones are not in the test yet.
      const rnd = await api().post(`/api/v1/lms/tests/${testId}/questions/random`).set(teacher()).send({ counts: { 5: 1, 6: 1 } }).expect(200);
      expect(rnd.body.added).toBe(1);
      expect(rnd.body.missing).toEqual({ 6: 1 });
      await api().put(`/api/v1/lms/tests/${testId}/questions`).set(teacher()).send({ questions: names.map((n) => ({ questionId: q[n], points: n === 'blank' || n === 'match' ? 2 : 1 })) }).expect(200);

      const pub = await api().post(`/api/v1/lms/tests/${testId}/publish`).set(teacher()).expect(200);
      expect(pub.body.status).toBe('PUBLISHED');
      await api().post(`/api/v1/lms/tests/${testId}/publish`).set(teacher()).expect(400);
      const notified = await prisma.notification.findMany({ where: { kind: 'TEST_ASSIGNED', data: { path: ['testId'], equals: testId } }, select: { userId: true, title: true, body: true } });
      expect(notified.map((n) => n.userId).sort()).toEqual([s1.user.id, s2.user.id, s3.user.id].sort());
      expect(notified[0].title).toBe('Bài kiểm tra mới');
      expect(notified[0].body).toBe('Kiểm tra 15 phút · hạn không giới hạn');

      const list = await api().get('/api/v1/lms/tests').set(teacher()).query({ kind: 'QUIZ' }).expect(200);
      expect(list.body.items.find((t: any) => t.id === testId)).toMatchObject({ questionCount: 8, attemptCount: 0, needsGrading: 0 });
      await api().get(`/api/v1/lms/tests/${testId}`).set(bearer(otherTokens.TEACHER)).expect(404);
      await api().delete(`/api/v1/lms/tests/${testId}`).set(teacher()).expect(400); // not a draft any more
    });

    it('is visible to the class students, who can start without seeing the keys', async () => {
      const mine = await api().get('/api/v1/student/tests').set(bearer(s1.token)).expect(200);
      const row = mine.body.find((t: any) => t.id === testId);
      expect(row).toMatchObject({ kind: 'QUIZ', status: 'PUBLISHED', questionCount: 8, canStart: true, myAttempts: [] });
      expect(row.questions).toBeUndefined();
      // Another class does not see it; staff cannot use the student routes.
      expect((await api().get('/api/v1/student/tests').set(bearer(s4.token)).expect(200)).body.find((t: any) => t.id === testId)).toBeUndefined();
      await api().get(`/api/v1/student/tests/${testId}`).set(bearer(s4.token)).expect(404);
      await api().get('/api/v1/student/tests').set(staff()).expect(403);
      await api().get('/api/v1/student/contests').set(teacher()).expect(403);

      const start = await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s1.token)).expect(201);
      attemptId = start.body.attempt.id;
      expect(start.body.attempt.endsAt).toBeTruthy();
      expect(start.body.attempt.remainingSec).toBeGreaterThan(850);
      expect(start.body.questions).toHaveLength(8);
      for (const question of start.body.questions) {
        expect(question.key).toBeUndefined();
        expect(question.answer).toBeUndefined();
        expect(question.correctAnswer).toBeUndefined();
        expect(question.explanation).toBeUndefined();
      }
      const single = start.body.questions.find((x: any) => x.id === q.single);
      expect(single.options.map((o: any) => o.key).sort()).toEqual(['A', 'B', 'C']);
      expect(JSON.stringify(start.body)).not.toContain('"pairs"');

      // Resume returns the same attempt; the payload is reproducible (same option order).
      const again = await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s1.token)).expect(201);
      expect(again.body.attempt.id).toBe(attemptId);
      expect(again.body.questions.map((x: any) => x.id)).toEqual(start.body.questions.map((x: any) => x.id));
      expect(again.body.questions.find((x: any) => x.id === q.single).options).toEqual(single.options);
      // Another student cannot read it.
      await api().get(`/api/v1/student/attempts/${attemptId}`).set(bearer(s2.token)).expect(404);
    });

    it('autosaves, submits and grades the known answer set', async () => {
      const saved = await api().put(`/api/v1/student/attempts/${attemptId}/answers`).set(bearer(s1.token)).send({ answers: { [q.single]: { key: 'B' }, nope: 1 } }).expect(200);
      expect(saved.body.saved).toBe(1);
      const resumed = await api().get(`/api/v1/student/attempts/${attemptId}`).set(bearer(s1.token)).expect(200);
      expect(resumed.body.attempt.answers).toEqual({ [q.single]: { key: 'B' } });
      expect(resumed.body.attempt.remainingSec).toBeGreaterThan(0);
      await api().get(`/api/v1/student/attempts/${attemptId}/result`).set(bearer(s1.token)).expect(400);

      const res = await api().post(`/api/v1/student/attempts/${attemptId}/submit`).set(bearer(s1.token)).send({ answers: answers() }).expect(200);
      // 1 + 1 + 1 + 1 (half of 2) + 1 + 1 + 1 (half of 2) + 1 = 8 of 10
      expect(res.body).toMatchObject({ status: 'GRADED', score: 8, maxScore: 10, percent: 80, passed: true, needsGrading: false });
      expect(res.body.durationSec).toBeGreaterThanOrEqual(0);
      const blank = res.body.questions.find((x: any) => x.id === q.blank);
      expect(blank).toMatchObject({ points: 1, max: 2, correct: false, correctAnswer: { blanks: [['2', 'hai'], ['4']] }, myAnswer: { blanks: ['hai', '3'] } });
      expect(res.body.questions.find((x: any) => x.id === q.order)).toMatchObject({ points: 1, correct: true });

      // Submitting twice is idempotent and autosave is now refused.
      await api().post(`/api/v1/student/attempts/${attemptId}/submit`).set(bearer(s1.token)).send({}).expect(200);
      await api().put(`/api/v1/student/attempts/${attemptId}/answers`).set(bearer(s1.token)).send({ answers: {} }).expect(400);
      const detail = await api().get(`/api/v1/student/tests/${testId}`).set(bearer(s1.token)).expect(200);
      expect(detail.body.myAttempts).toHaveLength(1);
      expect(detail.body.myBest.score).toBe(8);
      expect(detail.body.canStart).toBe(true);
    });

    it('enforces maxAttempts and the close date', async () => {
      const second = await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s1.token)).expect(201);
      expect(second.body.attempt.attemptNo).toBe(2);
      await api().post(`/api/v1/student/attempts/${second.body.attempt.id}/submit`).set(bearer(s1.token)).send({ answers: { [q.single]: { key: 'A' } } }).expect(200);
      const third = await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s1.token)).expect(400);
      expect(third.body.message).toMatch(/số lần/);
      expect((await api().get(`/api/v1/student/tests/${testId}`).set(bearer(s1.token)).expect(200)).body).toMatchObject({ canStart: false, reason: expect.stringMatching(/số lần/) });

      await api().patch(`/api/v1/lms/tests/${testId}`).set(teacher()).send({ closeAt: '2020-01-01T00:00:00.000Z' }).expect(200);
      const late = await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s2.token)).expect(400);
      expect(late.body.message).toMatch(/hết hạn/);
      await api().patch(`/api/v1/lms/tests/${testId}`).set(teacher()).send({ closeAt: null }).expect(200);
      const future = await api().patch(`/api/v1/lms/tests/${testId}`).set(teacher()).send({ openAt: '2099-01-01T00:00:00.000Z' }).expect(200);
      expect(future.body.openAt).toBe('2099-01-01T00:00:00.000Z');
      expect((await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s2.token)).expect(400)).body.message).toMatch(/Chưa đến/);
      await api().patch(`/api/v1/lms/tests/${testId}`).set(teacher()).send({ openAt: null }).expect(200);
      // The question list is frozen once there are attempts.
      await api().put(`/api/v1/lms/tests/${testId}/questions`).set(teacher()).send({ questions: [{ questionId: q.single, points: 1 }] }).expect(400);
    });

    it('ranks the leaderboard by score, then duration, and reports stats', async () => {
      const a2 = (await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s2.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a2}/submit`).set(bearer(s2.token)).send({ answers: answers() }).expect(200); // 8 points, same as s1
      const a3 = (await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s3.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a3}/submit`).set(bearer(s3.token)).send({ answers: { [q.single]: { key: 'A' }, [q.num]: { value: 56 } } }).expect(200); // 2 points
      // Make s2 faster than s1 to decide the tie.
      await prisma.testAttempt.updateMany({ where: { testId, studentId: s1.student.id }, data: { durationSec: 600 } });
      await prisma.testAttempt.update({ where: { id: a2 }, data: { durationSec: 120 } });

      const board = await api().get(`/api/v1/lms/tests/${testId}/leaderboard`).set(teacher()).expect(200);
      expect(board.body.rows.map((r: any) => [r.rank, r.student.id, r.score])).toEqual([
        [1, s2.student.id, 8],
        [2, s1.student.id, 8],
        [3, s3.student.id, 2],
      ]);
      expect(board.body.rows[0].student).toMatchObject({ fullName: 'Trần Bình', className: '6A1' });

      const attempts = await api().get(`/api/v1/lms/tests/${testId}/attempts`).set(teacher()).expect(200);
      const r1 = attempts.body.rows.find((r: any) => r.student.id === s1.student.id);
      expect(r1).toMatchObject({ attemptCount: 2, best: { score: 8 }, latest: { attemptNo: 2, score: 1 }, needsGrading: false });

      const stats = await api().get(`/api/v1/lms/tests/${testId}/stats`).set(teacher()).expect(200);
      expect(stats.body).toMatchObject({ attempts: 4, students: 3, avgPercent: 60, passRate: 66.7, passPercent: 50, needsGrading: 0 });
      expect(stats.body.perQuestion.find((p: any) => p.questionId === q.single).correctRate).toBe(100);
      expect(stats.body.perQuestion.find((p: any) => p.questionId === q.tf).correctRate).toBe(50);
      expect(stats.body.distribution.reduce((s: number, d: any) => s + d.count, 0)).toBe(3);
      expect(stats.body.distribution[8].count).toBe(2);

      const student = await api().get(`/api/v1/student/tests/${testId}/leaderboard`).set(bearer(s3.token)).expect(200);
      expect(student.body.me.rank).toBe(3);
      expect(student.body.rows).toHaveLength(3);

      const csv = await api().get(`/api/v1/lms/tests/${testId}/export`).set(teacher()).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text).toContain('1,' + s2.student.code + ',Trần Bình,6A1,8,10,80,120,');

      const teacherView = await api().get(`/api/v1/lms/attempts/${a3}`).set(teacher()).expect(200);
      expect(teacherView.body.student.id).toBe(s3.student.id);
      expect(teacherView.body.questions.find((x: any) => x.id === q.single)).toMatchObject({ myAnswer: { key: 'A' }, correctAnswer: { key: 'A' }, grading: { points: 1, correct: true } });
      await api().get(`/api/v1/lms/attempts/${a3}`).set(bearer(otherTokens.TEACHER)).expect(404);
    });

    it('closes the test: no more attempts, no more edits', async () => {
      const closed = await api().post(`/api/v1/lms/tests/${testId}/close`).set(teacher()).expect(200);
      expect(closed.body.status).toBe('CLOSED');
      expect((await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s2.token)).expect(400)).body.message).toMatch(/đã đóng/);
      await api().patch(`/api/v1/lms/tests/${testId}`).set(teacher()).send({ title: 'x' }).expect(400);
      const row = (await api().get('/api/v1/student/tests').set(bearer(s2.token)).expect(200)).body.find((t: any) => t.id === testId);
      expect(row).toMatchObject({ status: 'CLOSED', canStart: false });
    });
  });

  describe('essays and manual grading', () => {
    let testId: string;
    let attemptId: string;

    it('an essay leaves the attempt SUBMITTED until the teacher grades it', async () => {
      testId = (
        await api()
          .post('/api/v1/lms/tests')
          .set(teacher())
          .send({ kind: 'EXAM', title: 'Giữa kỳ', classIds: [classId], maxAttempts: 1, questions: [{ questionId: q.single, points: 2 }, { questionId: q.essay, points: 8 }] })
          .expect(201)
      ).body.id;
      await api().post(`/api/v1/lms/tests/${testId}/publish`).set(teacher()).expect(200);
      attemptId = (await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s2.token)).expect(201)).body.attempt.id;
      const res = await api().post(`/api/v1/student/attempts/${attemptId}/submit`).set(bearer(s2.token)).send({ answers: { [q.single]: { key: 'A' }, [q.essay]: { text: 'Quy đồng mẫu số rồi cộng tử số.' } } }).expect(200);
      expect(res.body).toMatchObject({ status: 'SUBMITTED', score: 2, maxScore: 10, needsGrading: true });
      expect(res.body.questions.find((x: any) => x.id === q.essay)).toMatchObject({ points: null, manual: true, correct: null });

      const list = await api().get('/api/v1/lms/tests').set(teacher()).query({ kind: 'EXAM' }).expect(200);
      expect(list.body.items.find((t: any) => t.id === testId).needsGrading).toBe(1);
      const attempts = await api().get(`/api/v1/lms/tests/${testId}/attempts`).set(teacher()).expect(200);
      expect(attempts.body.needsGrading).toBe(1);
      expect(attempts.body.rows[0]).toMatchObject({ needsGrading: true, latest: { status: 'SUBMITTED' } });
    });

    it('the teacher grades the essay and the score updates', async () => {
      await api().put(`/api/v1/lms/attempts/${attemptId}/grade`).set(teacher()).send({ items: { [q.essay]: 9 } }).expect(400); // > max
      await api().put(`/api/v1/lms/attempts/${attemptId}/grade`).set(teacher()).send({ items: { nope: 1 } }).expect(400);
      const graded = await api().put(`/api/v1/lms/attempts/${attemptId}/grade`).set(teacher()).send({ items: { [q.essay]: 6.5 } }).expect(200);
      expect(graded.body).toMatchObject({ status: 'GRADED', score: 8.5, needsGrading: false });
      expect(graded.body.gradedAt).toBeTruthy();
      expect(graded.body.questions.find((x: any) => x.id === q.essay).grading).toMatchObject({ points: 6.5, max: 8, manual: true });
      const mine = await api().get(`/api/v1/student/attempts/${attemptId}/result`).set(bearer(s2.token)).expect(200);
      expect(mine.body).toMatchObject({ status: 'GRADED', score: 8.5, percent: 85, passed: true });
      expect((await api().get(`/api/v1/lms/tests/${testId}/stats`).set(teacher()).expect(200)).body.needsGrading).toBe(0);
    });

    it('hides per-question feedback when the test does not show results', async () => {
      const hidden = (
        await api().post('/api/v1/lms/tests').set(teacher()).send({ title: 'Kín', classIds: [classId], showResults: false, questions: [{ questionId: q.tf, points: 1 }] }).expect(201)
      ).body.id;
      await api().post(`/api/v1/lms/tests/${hidden}/publish`).set(teacher()).expect(200);
      const a = (await api().post(`/api/v1/student/tests/${hidden}/attempts`).set(bearer(s3.token)).expect(201)).body.attempt.id;
      const res = await api().post(`/api/v1/student/attempts/${a}/submit`).set(bearer(s3.token)).send({ answers: { [q.tf]: { value: true } } }).expect(200);
      expect(res.body).toMatchObject({ score: 1, maxScore: 1, percent: 100, passed: true, questions: null });
      expect(JSON.stringify(res.body)).not.toContain('correctAnswer');
    });
  });

  describe('contests', () => {
    let contestId: string;

    it('a school-wide contest is visible to every class and notifies every student', async () => {
      contestId = (
        await api()
          .post('/api/v1/lms/tests')
          .set(teacher())
          .send({ kind: 'CONTEST', title: 'Olympic Toán', timeLimitMin: 30, maxAttempts: 1, closeAt: '2099-12-31T00:00:00.000Z', questions: [{ questionId: q.num, points: 5 }, { questionId: q.multi, points: 5 }] })
          .expect(201)
      ).body.id;
      await api().post(`/api/v1/lms/tests/${contestId}/publish`).set(teacher()).expect(200);
      const notified = await prisma.notification.findMany({ where: { kind: 'TEST_ASSIGNED', data: { path: ['testId'], equals: contestId } }, select: { userId: true, title: true, body: true } });
      expect(notified.map((n) => n.userId).sort()).toEqual([s1.user.id, s2.user.id, s3.user.id, s4.user.id].sort());
      expect(notified[0]).toMatchObject({ title: 'Cuộc thi mới', body: 'Olympic Toán · hạn 31/12 07:00' });

      // Not in the regular test list, but in the contests list of a student of another class.
      expect((await api().get('/api/v1/student/tests').set(bearer(s4.token)).expect(200)).body.find((t: any) => t.id === contestId)).toBeUndefined();
      const before = (await api().get('/api/v1/student/contests').set(bearer(s4.token)).expect(200)).body.find((t: any) => t.id === contestId);
      expect(before).toMatchObject({ kind: 'CONTEST', canStart: true, myRank: null, participants: 0, top: [] });

      const a4 = (await api().post(`/api/v1/student/tests/${contestId}/attempts`).set(bearer(s4.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a4}/submit`).set(bearer(s4.token)).send({ answers: { [q.num]: { value: '56' }, [q.multi]: { keys: ['A'] } } }).expect(200);
      const a1 = (await api().post(`/api/v1/student/tests/${contestId}/attempts`).set(bearer(s1.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a1}/submit`).set(bearer(s1.token)).send({ answers: { [q.num]: { value: 56 }, [q.multi]: { keys: ['A', 'C'] } } }).expect(200);

      const after = (await api().get('/api/v1/student/contests').set(bearer(s4.token)).expect(200)).body.find((t: any) => t.id === contestId);
      expect(after).toMatchObject({ myRank: 2, participants: 2, canStart: false, myBest: { score: 5 } });
      expect(after.top.map((r: any) => r.student.id)).toEqual([s1.student.id, s4.student.id]);
      const board = await api().get(`/api/v1/student/tests/${contestId}/leaderboard`).set(bearer(s4.token)).expect(200);
      expect(board.body.me).toMatchObject({ rank: 2, score: 5 });
    });
  });

  describe('course quiz lessons', () => {
    it('submitting the quiz completes the lesson and the course progress', async () => {
      const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-as${run}@test.vn`.toLowerCase() } });
      const teacherRow = await prisma.teacher.create({ data: { schoolId, code: `GV${run}`, fullName: 'GV', userId: teacherUser.id } });
      const testId = (
        await api().post('/api/v1/lms/tests').set(teacher()).send({ title: 'Quiz bài 1', classIds: [classId], questions: [{ questionId: q.tf, points: 1 }] }).expect(201)
      ).body.id;
      await api().post(`/api/v1/lms/tests/${testId}/publish`).set(teacher()).expect(200);
      const course = await prisma.course.create({ data: { schoolId, teacherId: teacherRow.id, title: 'Toán 6', status: 'PUBLISHED' } });
      const lesson = await prisma.lesson.create({ data: { schoolId, courseId: course.id, title: 'Quiz', type: 'QUIZ', testId, sortOrder: 1 } });
      await prisma.courseEnrollment.create({ data: { courseId: course.id, studentId: s3.student.id } });

      const a = (await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s3.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a}/submit`).set(bearer(s3.token)).send({ answers: { [q.tf]: { value: false } } }).expect(200);
      const progress = await prisma.lessonProgress.findUnique({ where: { lessonId_studentId: { lessonId: lesson.id, studentId: s3.student.id } } });
      expect(progress?.status).toBe('COMPLETED');
      expect(progress?.completedAt).toBeTruthy();
      const enrollment = await prisma.courseEnrollment.findUnique({ where: { courseId_studentId: { courseId: course.id, studentId: s3.student.id } } });
      expect(enrollment?.progressPct).toBe(100);
      expect(enrollment?.completedAt).toBeTruthy();
      // A student not enrolled in the course gets no progress row.
      const a1 = (await api().post(`/api/v1/student/tests/${testId}/attempts`).set(bearer(s1.token)).expect(201)).body.attempt.id;
      await api().post(`/api/v1/student/attempts/${a1}/submit`).set(bearer(s1.token)).send({}).expect(200);
      expect(await prisma.lessonProgress.count({ where: { lessonId: lesson.id, studentId: s1.student.id } })).toBe(0);
      // A test bound to a course is visible to its enrolled students even outside the classes.
      const courseTest = (await api().post('/api/v1/lms/tests').set(teacher()).send({ title: 'Quiz khóa học', courseId: course.id, questions: [{ questionId: q.tf, points: 1 }] }).expect(201)).body.id;
      await api().post(`/api/v1/lms/tests/${courseTest}/publish`).set(teacher()).expect(200);
      expect((await api().get('/api/v1/student/tests').set(bearer(s3.token)).expect(200)).body.find((t: any) => t.id === courseTest)?.course).toEqual({ id: course.id, title: 'Toán 6' });
      expect((await api().get('/api/v1/student/tests').set(bearer(s4.token)).expect(200)).body.find((t: any) => t.id === courseTest)).toBeUndefined();
    });
  });
});

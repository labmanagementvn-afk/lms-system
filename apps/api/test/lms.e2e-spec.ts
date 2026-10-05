import { INestApplication } from '@nestjs/common';
import { StudentStatus, TestKind, TestStatus } from '@prisma/client';
import request from 'supertest';
import { bearer, createApp, createClass, createSchool, createStudent, prisma, runId } from './helpers';

// Courses, lessons, progress, boards, live rooms and reports against a real Postgres.
describe('LMS (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let teacherUserId: string;
  let teacherId: string;
  let subjectId: string;
  let classA: string;
  let classB: string;
  let s1: Awaited<ReturnType<typeof createStudent>>; // 6A
  let s2: Awaited<ReturnType<typeof createStudent>>; // 6A
  let s3: Awaited<ReturnType<typeof createStudent>>; // 6B
  let left: Awaited<ReturnType<typeof createStudent>>; // 6A but transferred away
  let testId: string;
  let plainFileId: string;
  let scormFileId: string;
  let courseId: string;
  let sectionId: string;
  const lessons: Record<string, string> = {};
  let openCourseId: string;
  let threadId: string;
  let liveId: string;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `LA${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `LB${run}`)).tokens;
    teacherUserId = (await prisma.user.findUniqueOrThrow({ where: { email: `teacher-la${run}@test.vn`.toLowerCase() } })).id;
    const adminUserId = (await prisma.user.findUniqueOrThrow({ where: { email: `admin-la${run}@test.vn`.toLowerCase() } })).id;
    subjectId = (await prisma.subject.create({ data: { schoolId, code: 'TOAN', name: 'Toán' } })).id;
    classA = (await createClass(schoolId, '6A')).id;
    classB = (await createClass(schoolId, '6B')).id;
    s1 = await createStudent(app, schoolId, { classId: classA, fullName: 'Nguyễn Văn An' });
    s2 = await createStudent(app, schoolId, { classId: classA, fullName: 'Trần Thị Bình' });
    s3 = await createStudent(app, schoolId, { classId: classB, fullName: 'Lê Minh Châu' });
    left = await createStudent(app, schoolId, { classId: classA, fullName: 'Đã chuyển trường' });
    await prisma.student.update({ where: { id: left.student.id }, data: { status: StudentStatus.TRANSFERRED } });
    testId = (await prisma.test.create({ data: { schoolId, title: 'Kiểm tra 15 phút', kind: TestKind.QUIZ, status: TestStatus.PUBLISHED, createdById: adminUserId } })).id;
    plainFileId = (await prisma.storedFile.create({ data: { schoolId, name: 'bai-giang.pdf', mimeType: 'application/pdf', size: 1024, path: `files/${run}.pdf` } })).id;
    scormFileId = (
      await prisma.storedFile.create({ data: { schoolId, name: 'scorm.zip', mimeType: 'application/zip', size: 2048, path: `scorm/${run}`, launchPath: 'index_lms.html' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const notifications = (userId: string, kind: string) => prisma.notification.findMany({ where: { userId, kind: kind as any }, orderBy: { createdAt: 'asc' } });

  describe('course builder', () => {
    it('needs a Teacher row behind a teacher login', async () => {
      await api().post('/api/v1/lms/courses').set(teacher()).send({ title: 'Toán 6' }).expect(400);
      teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Nguyễn Thị Lan', userId: teacherUserId } })).id;
    });

    it('creates a course owned by the teacher, with sections and type-checked lessons', async () => {
      const res = await api()
        .post('/api/v1/lms/courses')
        .set(teacher())
        .send({ title: 'Toán 6 – Số tự nhiên', description: 'Chương 1', subjectId, gradeLevel: 6, classIds: [classA] })
        .expect(201);
      courseId = res.body.id;
      expect(res.body).toMatchObject({ status: 'DRAFT', teacherId, teacher: { id: teacherId, fullName: 'Nguyễn Thị Lan' }, subject: { code: 'TOAN' }, classIds: [classA] });
      expect(res.body.academicYearId).toBeTruthy();
      expect(res.body.sections).toEqual([]);

      sectionId = (await api().post(`/api/v1/lms/courses/${courseId}/sections`).set(teacher()).send({ title: 'Chương 1: Tập hợp' }).expect(201)).body.id;

      const add = (body: Record<string, unknown>) => api().post(`/api/v1/lms/courses/${courseId}/lessons`).set(teacher()).send(body);
      // Incomplete lessons are refused per type.
      await add({ sectionId, title: 'Bài đọc rỗng', type: 'TEXT' }).expect(400);
      await add({ sectionId, title: 'Link rỗng', type: 'LINK' }).expect(400);
      await add({ sectionId, title: 'Video rỗng', type: 'VIDEO' }).expect(400);
      await add({ sectionId, title: 'Không phải SCORM', type: 'SCORM', fileId: plainFileId }).expect(400);
      await add({ sectionId, title: 'Đề không tồn tại', type: 'QUIZ', testId: 'nope' }).expect(400);
      await add({ sectionId, title: 'Tệp lạ', type: 'DOCUMENT', fileId: 'nope' }).expect(400);
      await add({ sectionId: 'nope', title: 'Mục lạ', type: 'TEXT', content: 'x' }).expect(400);

      lessons.text = (await add({ sectionId, title: 'Bài 1: Tập hợp', type: 'TEXT', content: 'Tập hợp là...\n\nPhần tử của tập hợp...', durationMin: 10 }).expect(201)).body.id;
      lessons.link = (await add({ sectionId, title: 'Video bài giảng', type: 'LINK', url: 'https://www.youtube.com/watch?v=abc' }).expect(201)).body.id;
      const quiz = (await add({ sectionId, title: 'Kiểm tra 15 phút', type: 'QUIZ', testId }).expect(201)).body;
      lessons.quiz = quiz.id;
      expect(quiz.test).toMatchObject({ id: testId, title: 'Kiểm tra 15 phút', status: 'PUBLISHED' });
      const doc = (await add({ title: 'Tài liệu tham khảo', type: 'DOCUMENT', fileId: plainFileId, isRequired: false }).expect(201)).body;
      lessons.doc = doc.id;
      expect(doc.file).toMatchObject({ id: plainFileId, name: 'bai-giang.pdf', launchPath: null });
      const scorm = (await add({ title: 'Gói SCORM', type: 'SCORM', fileId: scormFileId, isRequired: false }).expect(201)).body;
      lessons.scorm = scorm.id;
      expect(scorm.file.launchPath).toBe('index_lms.html');
      // Linking the quiz tied the test to the course.
      expect((await prisma.test.findUniqueOrThrow({ where: { id: testId } })).courseId).toBe(courseId);

      const detail = (await api().get(`/api/v1/lms/courses/${courseId}`).set(admin()).expect(200)).body;
      expect(detail.lessonCount).toBe(5);
      expect(detail.sections).toHaveLength(1);
      expect(detail.sections[0].lessons.map((l: any) => l.title)).toEqual(['Bài 1: Tập hợp', 'Video bài giảng', 'Kiểm tra 15 phút']);
      expect(detail.unsectioned.map((l: any) => l.id)).toEqual([lessons.doc, lessons.scorm]);

      // Editing re-validates with the merged fields.
      await api().patch(`/api/v1/lms/lessons/${lessons.text}`).set(teacher()).send({ type: 'LINK' }).expect(400);
      const edited = (await api().patch(`/api/v1/lms/lessons/${lessons.text}`).set(teacher()).send({ title: 'Bài 1: Tập hợp (sửa)', durationMin: 12 }).expect(200)).body;
      expect(edited).toMatchObject({ title: 'Bài 1: Tập hợp (sửa)', durationMin: 12, type: 'TEXT' });

      const list = (await api().get('/api/v1/lms/courses').query({ mine: 'true' }).set(teacher()).expect(200)).body;
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ id: courseId, lessonCount: 5, enrollmentCount: 0 });
      expect((await api().get('/api/v1/lms/courses').query({ status: 'PUBLISHED' }).set(admin()).expect(200)).body.total).toBe(0);
    });

    it('reorders sections and lessons from the builder layout', async () => {
      const res = await api()
        .post(`/api/v1/lms/courses/${courseId}/reorder`)
        .set(teacher())
        .send({ sections: [{ id: sectionId, lessonIds: [lessons.link, lessons.text, lessons.doc] }, { id: null, lessonIds: [lessons.quiz, lessons.scorm] }] })
        .expect(200);
      expect(res.body.sections[0].lessons.map((l: any) => l.id)).toEqual([lessons.link, lessons.text, lessons.doc]);
      expect(res.body.unsectioned.map((l: any) => l.id)).toEqual([lessons.quiz, lessons.scorm]);
      await api().post(`/api/v1/lms/courses/${courseId}/reorder`).set(teacher()).send({ sections: [{ id: 'nope', lessonIds: [] }] }).expect(400);
      // Deleting the section keeps its lessons.
      const section2 = (await api().post(`/api/v1/lms/courses/${courseId}/sections`).set(teacher()).send({ title: 'Tạm' }).expect(201)).body;
      await api().post(`/api/v1/lms/courses/${courseId}/reorder`).set(teacher()).send({ sections: [{ id: section2.id, lessonIds: [lessons.scorm] }] }).expect(200);
      await api().delete(`/api/v1/lms/sections/${section2.id}`).set(teacher()).expect(200);
      const detail = (await api().get(`/api/v1/lms/courses/${courseId}`).set(teacher()).expect(200)).body;
      expect(detail.lessonCount).toBe(5);
      expect(detail.unsectioned.map((l: any) => l.id)).toEqual(expect.arrayContaining([lessons.quiz, lessons.scorm]));
      // Back to the layout the rest of the tests assume: all five lessons in the section, text first.
      await api()
        .post(`/api/v1/lms/courses/${courseId}/reorder`)
        .set(teacher())
        .send({ sections: [{ id: sectionId, lessonIds: [lessons.text, lessons.link, lessons.quiz, lessons.doc, lessons.scorm] }] })
        .expect(200);
    });

    it('publishes: enrols the studying students of the audience classes and notifies them', async () => {
      const res = await api().post(`/api/v1/lms/courses/${courseId}/publish`).set(teacher()).expect(200);
      expect(res.body).toMatchObject({ status: 'PUBLISHED', enrolled: 2, enrollmentCount: 2 });
      const enrolled = await prisma.courseEnrollment.findMany({ where: { courseId }, select: { studentId: true } });
      expect(enrolled.map((e) => e.studentId).sort()).toEqual([s1.student.id, s2.student.id].sort());
      for (const s of [s1, s2]) {
        const n = await notifications(s.user.id, 'COURSE_PUBLISHED');
        expect(n).toHaveLength(1);
        expect(n[0]).toMatchObject({ title: 'Khóa học mới', body: 'Toán 6 – Số tự nhiên đã mở, vào học ngay nhé', data: { courseId } });
      }
      expect(await notifications(s3.user.id, 'COURSE_PUBLISHED')).toHaveLength(0);
      // Publishing again only picks up newcomers; nobody is told twice.
      expect((await api().post(`/api/v1/lms/courses/${courseId}/publish`).set(teacher()).expect(200)).body.enrolled).toBe(0);
      expect(await notifications(s1.user.id, 'COURSE_PUBLISHED')).toHaveLength(1);

      const roster = (await api().get(`/api/v1/lms/courses/${courseId}/students`).set(teacher()).expect(200)).body;
      expect(roster.lessons.map((l: any) => l.id)).toEqual([lessons.text, lessons.link, lessons.quiz, lessons.doc, lessons.scorm]);
      expect(roster.students).toHaveLength(2);
      expect(roster.students[0]).toMatchObject({ progressPct: 0, completedAt: null, lastAt: null, lessons: {} });
      expect(roster.students.map((r: any) => r.student.class.name)).toEqual(['6A', '6A']);

      // Manual enrolment and removal.
      await api().post(`/api/v1/lms/courses/${courseId}/students`).set(teacher()).send({ studentIds: ['nope'] }).expect(400);
      expect((await api().post(`/api/v1/lms/courses/${courseId}/students`).set(teacher()).send({ studentIds: [s3.student.id, s1.student.id] }).expect(201)).body).toEqual({ added: 1 });
      await api().delete(`/api/v1/lms/courses/${courseId}/students/${s3.student.id}`).set(teacher()).expect(200);
      await api().delete(`/api/v1/lms/courses/${courseId}/students/${s3.student.id}`).set(teacher()).expect(404);
    });
  });

  describe('student app', () => {
    it('lists enrolled courses with the next lesson, and open courses only when the class matches', async () => {
      const mine = (await api().get('/api/v1/student/courses').set(bearer(s1.token)).expect(200)).body;
      expect(mine.enrolled).toHaveLength(1);
      expect(mine.enrolled[0]).toMatchObject({ id: courseId, progressPct: 0, lessonCount: 5, nextLesson: { id: lessons.text, type: 'TEXT' }, teacher: { fullName: 'Nguyễn Thị Lan' } });
      expect(mine.available).toEqual([]);

      // A 6B student is outside the audience: nothing enrolled, nothing to join.
      let other = (await api().get('/api/v1/student/courses').set(bearer(s3.token)).expect(200)).body;
      expect(other).toEqual({ enrolled: [], available: [] });
      await api().post(`/api/v1/student/courses/${courseId}/enrol`).set(bearer(s3.token)).expect(400);

      // A school-wide course (no classes) is open to everyone not yet enrolled.
      openCourseId = (await api().post('/api/v1/lms/courses').set(admin()).send({ title: 'Kỹ năng số', teacherId }).expect(201)).body.id;
      await api().post(`/api/v1/lms/courses/${openCourseId}/lessons`).set(admin()).send({ title: 'Bài 1', type: 'TEXT', content: 'An toàn trên mạng' }).expect(201);
      const published = (await api().post(`/api/v1/lms/courses/${openCourseId}/publish`).set(admin()).expect(200)).body;
      expect(published.enrolled).toBe(3); // s1, s2, s3; the transferred student is skipped
      // Someone enrolled later (a new student) sees it under "available" and may join.
      const s4 = await createStudent(app, schoolId, { classId: classB, fullName: 'Phạm Quốc Dũng' });
      other = (await api().get('/api/v1/student/courses').set(bearer(s4.token)).expect(200)).body;
      expect(other.enrolled).toEqual([]);
      expect(other.available.map((c: any) => c.id)).toEqual([openCourseId]);
      const joined = (await api().post(`/api/v1/student/courses/${openCourseId}/enrol`).set(bearer(s4.token)).expect(200)).body;
      expect(joined).toMatchObject({ id: openCourseId, progressPct: 0 });
      await api().post(`/api/v1/student/courses/${openCourseId}/enrol`).set(bearer(s4.token)).expect(400);
      expect((await api().get('/api/v1/student/courses').set(bearer(s4.token)).expect(200)).body.available).toEqual([]);
    });

    it('tracks lesson progress and completes the enrolment at 100 % of the required lessons', async () => {
      const course = (await api().get(`/api/v1/student/courses/${courseId}`).set(bearer(s1.token)).expect(200)).body;
      expect(course.sections[0].lessons.map((l: any) => l.progress)).toEqual([null, null, null, null, null]);
      await api().get(`/api/v1/student/courses/${courseId}`).set(bearer(s3.token)).expect(403);

      const lesson = (await api().get(`/api/v1/student/lessons/${lessons.link}`).set(bearer(s1.token)).expect(200)).body;
      expect(lesson).toMatchObject({ id: lessons.link, url: 'https://www.youtube.com/watch?v=abc', progress: null, previous: { id: lessons.text }, next: { id: lessons.quiz }, course: { id: courseId } });
      await api().get(`/api/v1/student/lessons/${lessons.link}`).set(bearer(s3.token)).expect(403);

      const post = (id: string, body: Record<string, unknown>) => api().post(`/api/v1/student/lessons/${id}/progress`).set(bearer(s1.token)).send(body);
      let r = (await post(lessons.text, { secondsSpent: 30 }).expect(200)).body;
      expect(r).toMatchObject({ progress: { status: 'IN_PROGRESS', secondsSpent: 30, completedAt: null }, progressPct: 0, completedAt: null });
      r = (await post(lessons.text, { secondsSpent: 45, status: 'COMPLETED' }).expect(200)).body;
      expect(r.progress).toMatchObject({ status: 'COMPLETED', secondsSpent: 75 });
      expect(r.progress.completedAt).toBeTruthy();
      expect(r.progressPct).toBe(33); // 1 of 3 required lessons (doc and scorm are optional)
      // Optional lessons do not move the percentage; SCORM data is kept.
      r = (await post(lessons.scorm, { status: 'COMPLETED', scormData: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' } }).expect(200)).body;
      expect(r).toMatchObject({ progress: { status: 'COMPLETED', scormData: { 'cmi.core.score.raw': '90' } }, progressPct: 33 });
      r = (await post(lessons.link, { status: 'COMPLETED' }).expect(200)).body;
      expect(r.progressPct).toBe(67);
      // Re-opening a finished lesson keeps it finished.
      r = (await post(lessons.link, { secondsSpent: 10 }).expect(200)).body;
      expect(r.progress).toMatchObject({ status: 'COMPLETED', secondsSpent: 10 });
      r = (await post(lessons.quiz, { status: 'COMPLETED' }).expect(200)).body;
      expect(r.progressPct).toBe(100);
      expect(r.completedAt).toBeTruthy();
      await post(lessons.quiz, { status: 'DONE' }).expect(400);

      const mine = (await api().get('/api/v1/student/courses').set(bearer(s1.token)).expect(200)).body;
      expect(mine.enrolled.find((c: any) => c.id === courseId)).toMatchObject({ progressPct: 100, nextLesson: { id: lessons.doc } });
      const roster = (await api().get(`/api/v1/lms/courses/${courseId}/students`).set(teacher()).expect(200)).body;
      const row = roster.students.find((r: any) => r.student.id === s1.student.id);
      expect(row).toMatchObject({ progressPct: 100, secondsSpent: 85, lessons: { [lessons.text]: { status: 'COMPLETED', secondsSpent: 75 } } });
      expect(row.completedAt).toBeTruthy();
      expect(row.lastAt).toBeTruthy();
    });
  });

  describe('discussions', () => {
    it('threads and posts; locked threads refuse replies; pinned threads come first', async () => {
      await api().post(`/api/v1/lms/courses/${courseId}/threads`).set(teacher()).send({ title: 'x', body: 'y', lessonId: 'nope' }).expect(400);
      const t = (await api().post(`/api/v1/lms/courses/${courseId}/threads`).set(teacher()).send({ title: 'Hỏi đáp bài 1', body: 'Các em hỏi tại đây', lessonId: lessons.text }).expect(201)).body;
      threadId = t.id;
      expect(t).toMatchObject({ author: { id: teacherUserId, role: 'TEACHER' }, lesson: { id: lessons.text }, posts: [] });

      const mine = (await api().post(`/api/v1/student/courses/${courseId}/threads`).set(bearer(s1.token)).send({ title: 'Em chưa hiểu phần tử', body: 'Thầy giải thích thêm ạ' }).expect(201)).body;
      await api().post(`/api/v1/student/courses/${courseId}/threads`).set(bearer(s3.token)).send({ title: 'x', body: 'y' }).expect(403);

      const reply = (await api().post(`/api/v1/student/threads/${threadId}/posts`).set(bearer(s1.token)).send({ body: 'Em có câu hỏi' }).expect(201)).body;
      expect(reply).toMatchObject({ threadId, body: 'Em có câu hỏi', author: { id: s1.user.id, role: 'STUDENT' } });
      await api().post(`/api/v1/lms/threads/${threadId}/posts`).set(teacher()).send({ body: 'Thầy trả lời' }).expect(201);
      await api().get(`/api/v1/student/threads/${threadId}`).set(bearer(s3.token)).expect(403);

      const detail = (await api().get(`/api/v1/student/threads/${threadId}`).set(bearer(s1.token)).expect(200)).body;
      expect(detail.posts.map((p: any) => p.body)).toEqual(['Em có câu hỏi', 'Thầy trả lời']);

      await api().patch(`/api/v1/lms/threads/${threadId}`).set(teacher()).send({ isLocked: true }).expect(200);
      await api().post(`/api/v1/student/threads/${threadId}/posts`).set(bearer(s1.token)).send({ body: 'Nữa' }).expect(400);
      await api().post(`/api/v1/lms/threads/${threadId}/posts`).set(teacher()).send({ body: 'Nữa' }).expect(400);

      // The student's newer thread leads until the teacher pins theirs.
      let list = (await api().get(`/api/v1/student/courses/${courseId}/threads`).set(bearer(s1.token)).expect(200)).body;
      expect(list.map((t: any) => t.id)).toEqual([mine.id, threadId]);
      await api().patch(`/api/v1/lms/threads/${threadId}`).set(teacher()).send({ isPinned: true }).expect(200);
      list = (await api().get(`/api/v1/lms/courses/${courseId}/threads`).set(teacher()).expect(200)).body;
      expect(list.map((t: any) => t.id)).toEqual([threadId, mine.id]);
      expect(list[0]).toMatchObject({ isPinned: true, isLocked: true, postCount: 2, lastPost: { author: { id: teacherUserId } } });

      await api().delete(`/api/v1/lms/posts/${reply.id}`).set(teacher()).expect(200);
      await api().delete(`/api/v1/lms/posts/${reply.id}`).set(teacher()).expect(404);
      await api().delete(`/api/v1/lms/threads/${mine.id}`).set(teacher()).expect(200);
      expect((await api().get(`/api/v1/lms/courses/${courseId}/threads`).set(teacher()).expect(200)).body).toHaveLength(1);
    });
  });

  describe('live classes', () => {
    it('schedules a Jitsi room, starts it with a notification, records who joined and closes it', async () => {
      const startsAt = new Date(Date.now() + 3_600_000).toISOString();
      const created = (await api().post('/api/v1/lms/live').set(teacher()).send({ courseId, title: 'Ôn tập chương 1', startsAt }).expect(201)).body;
      liveId = created.id;
      expect(created.roomName).toMatch(new RegExp(`^lms-la${run}-[a-z0-9]{10}$`));
      expect(created).toMatchObject({ status: 'SCHEDULED', durationMin: 45, joinUrl: `https://meet.jit.si/${created.roomName}`, attendanceCount: 0, course: { id: courseId } });
      await api().post('/api/v1/lms/live').set(teacher()).send({ courseId: 'nope', title: 'x', startsAt }).expect(404);

      // An hour early the room is closed to students.
      const upcoming = (await api().get('/api/v1/student/live').set(bearer(s1.token)).expect(200)).body;
      expect(upcoming.map((s: any) => s.id)).toEqual([liveId]);
      expect(upcoming[0]).toMatchObject({ canJoin: false, joined: false, joinUrl: created.joinUrl });
      await api().post(`/api/v1/student/live/${liveId}/join`).set(bearer(s1.token)).expect(400);
      await api().post(`/api/v1/lms/live/${liveId}/end`).set(teacher()).expect(400);

      const live = (await api().post(`/api/v1/lms/live/${liveId}/start`).set(teacher()).expect(200)).body;
      expect(live.status).toBe('LIVE');
      expect(live.startedAt).toBeTruthy();
      const n = await notifications(s1.user.id, 'LIVE_CLASS');
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ title: 'Lớp học trực tuyến', body: 'Ôn tập chương 1 đang bắt đầu, vào lớp ngay' });
      expect(await notifications(s3.user.id, 'LIVE_CLASS')).toHaveLength(0);
      await api().post(`/api/v1/lms/live/${liveId}/start`).set(teacher()).expect(400);

      expect((await api().post(`/api/v1/student/live/${liveId}/join`).set(bearer(s1.token)).expect(200)).body).toEqual({ joinUrl: created.joinUrl });
      await api().post(`/api/v1/student/live/${liveId}/join`).set(bearer(s1.token)).expect(200); // idempotent
      await api().post(`/api/v1/student/live/${liveId}/join`).set(bearer(s3.token)).expect(404); // not enrolled
      let detail = (await api().get(`/api/v1/lms/live/${liveId}`).set(teacher()).expect(200)).body;
      expect(detail.attendanceCount).toBe(1);
      expect(detail.attendances[0]).toMatchObject({ leftAt: null, student: { id: s1.student.id, code: s1.student.code, class: { name: '6A' } } });
      expect((await api().get('/api/v1/student/live').set(bearer(s1.token)).expect(200)).body[0]).toMatchObject({ status: 'LIVE', canJoin: true, joined: true });

      detail = (await api().post(`/api/v1/lms/live/${liveId}/end`).set(teacher()).expect(200)).body;
      expect(detail.status).toBe('ENDED');
      expect(detail.endedAt).toBeTruthy();
      expect(detail.attendances[0].leftAt).toBeTruthy();
      await api().delete(`/api/v1/lms/live/${liveId}`).set(teacher()).expect(400);
      await api().post(`/api/v1/student/live/${liveId}/join`).set(bearer(s1.token)).expect(400);

      // Scheduled rooms can be cancelled and then deleted; the list puts past rooms last.
      const soon = (await api().post('/api/v1/lms/live').set(admin()).send({ courseId, title: 'Sắp tới', startsAt: new Date(Date.now() + 600_000).toISOString(), durationMin: 30 }).expect(201)).body;
      const list = (await api().get('/api/v1/lms/live').query({ courseId }).set(admin()).expect(200)).body;
      expect(list.map((s: any) => s.id)).toEqual([soon.id, liveId]);
      await api().post(`/api/v1/lms/live/${soon.id}/cancel`).set(admin()).expect(200);
      await api().delete(`/api/v1/lms/live/${soon.id}`).set(admin()).expect(200);
    });
  });

  describe('reports and lifecycle', () => {
    let draftId: string;

    it('reports the school overview, one course and one student', async () => {
      draftId = (await api().post('/api/v1/lms/courses').set(teacher()).send({ title: 'Nháp' }).expect(201)).body.id;
      const o = (await api().get('/api/v1/lms/reports/overview').set(staff()).expect(200)).body;
      expect(o.courses).toEqual({ total: 3, published: 2, draft: 1, archived: 0 });
      expect(o.enrollments).toBe(6); // 2 + 4
      expect(o.completionRate).toBe(17); // 1 of 6
      expect(o.activeStudents7d).toBe(1);
      expect(o.lessonsByType).toMatchObject({ TEXT: 2, LINK: 1, QUIZ: 1, DOCUMENT: 1, SCORM: 1, VIDEO: 0, H5P: 0 });
      expect(o.liveSessions).toEqual({ upcoming: 0, ended: 1 });

      const c = (await api().get(`/api/v1/lms/reports/courses/${courseId}`).set(teacher()).expect(200)).body;
      expect(c.course.id).toBe(courseId);
      expect(c.lessons.map((l: any) => [l.id, l.completed, l.inProgress, l.notStarted])).toEqual([
        [lessons.text, 1, 0, 1],
        [lessons.link, 1, 0, 1],
        [lessons.quiz, 1, 0, 1],
        [lessons.doc, 0, 0, 2],
        [lessons.scorm, 1, 0, 1],
      ]);
      expect(c.lessons[0].avgSeconds).toBe(75);
      expect(c.students.find((s: any) => s.student.id === s1.student.id)).toMatchObject({ progressPct: 100, secondsSpent: 85, lessonsCompleted: 4 });

      const s = (await api().get(`/api/v1/lms/reports/students/${s1.student.id}`).set(teacher()).expect(200)).body;
      expect(s.student.code).toBe(s1.student.code);
      expect(s.courses.map((c: any) => [c.course.id, c.progressPct])).toEqual(expect.arrayContaining([[courseId, 100], [openCourseId, 0]]));
      await api().get('/api/v1/lms/reports/students/nope').set(teacher()).expect(404);
    });

    it('deletes draft courses only, and archives published ones', async () => {
      await api().delete(`/api/v1/lms/courses/${courseId}`).set(teacher()).expect(400);
      await api().delete(`/api/v1/lms/courses/${draftId}`).set(teacher()).expect(200);
      await api().get(`/api/v1/lms/courses/${draftId}`).set(teacher()).expect(404);
      expect((await api().post(`/api/v1/lms/courses/${openCourseId}/archive`).set(admin()).expect(200)).body.status).toBe('ARCHIVED');
      // Archived courses stay visible to enrolled students but are not offered to newcomers.
      const s5 = await createStudent(app, schoolId, { classId: classB });
      expect((await api().get('/api/v1/student/courses').set(bearer(s5.token)).expect(200)).body.available).toEqual([]);
    });

    it('keeps the student app and the portal apart, and schools apart', async () => {
      await api().get('/api/v1/student/courses').set(staff()).expect(403);
      await api().post(`/api/v1/student/lessons/${lessons.text}/progress`).set(teacher()).send({}).expect(403);
      await api().get('/api/v1/lms/courses').set(bearer(s1.token)).expect(403);
      await api().get('/api/v1/lms/reports/overview').set(bearer(s1.token)).expect(403);

      const other = bearer(otherTokens.ADMIN);
      await api().get(`/api/v1/lms/courses/${courseId}`).set(other).expect(404);
      await api().patch(`/api/v1/lms/courses/${courseId}`).set(other).send({ title: 'x' }).expect(404);
      await api().post(`/api/v1/lms/courses/${courseId}/lessons`).set(other).send({ title: 'x', type: 'TEXT', content: 'y' }).expect(404);
      await api().patch(`/api/v1/lms/lessons/${lessons.text}`).set(other).send({ title: 'x' }).expect(404);
      await api().get(`/api/v1/lms/threads/${threadId}`).set(other).expect(404);
      await api().get(`/api/v1/lms/live/${liveId}`).set(other).expect(404);
      await api().get(`/api/v1/lms/reports/courses/${courseId}`).set(other).expect(404);
      expect((await api().get('/api/v1/lms/courses').set(other).expect(200)).body.total).toBe(0);
      expect((await api().get('/api/v1/lms/reports/overview').set(other).expect(200)).body.courses.total).toBe(0);
    });
  });
});

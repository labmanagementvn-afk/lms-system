import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { bearer, createApp, createParent, createSchool, createStudent, prisma, runId } from './helpers';

// Phase 6: column locks, entry window and edit limit, edit log, entry monitoring,
// exemptions, family visibility, Excel import and the official reports.
describe('Gradebook control and reports (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let schoolId: string;
  let yearId: string;
  let classId: string;
  let teacherId: string;
  let toan: string;
  let gdtc: string;
  let students: Awaited<ReturnType<typeof createStudent>>[];
  let parent: Awaited<ReturnType<typeof createParent>>;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const teacher = () => bearer(tokens.TEACHER);
  const save = (entries: unknown[], auth = teacher(), subjectId = toan) => api().put('/api/v1/grades/book').set(auth).send({ classId, subjectId, semester: 1, entries });
  const full = (studentId: string, value: number) => [
    ...[1, 2, 3].map((index) => ({ studentId, kind: 'TX', index, value })),
    { studentId, kind: 'GK', index: 1, value },
    { studentId, kind: 'CK', index: 1, value },
  ];
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `GC${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    await prisma.school.update({ where: { id: schoolId }, data: { governingBody: 'UBND phường Bình Phước', principalName: 'Trịnh Thị Mai', locality: 'Đồng Nai' } });
    yearId = (await prisma.academicYear.findFirstOrThrow({ where: { schoolId } })).id;
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: `teacher-gc${run}@test.vn`.toLowerCase() } });
    teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV1', fullName: 'Phan Thị Thu', userId: teacherUser.id } })).id;
    classId = (await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: '9/11', gradeLevel: 9, homeroomTeacherId: teacherId } })).id;
    toan = (await prisma.subject.create({ data: { schoolId, code: 'TOAN', name: 'Toán' } })).id;
    gdtc = (await prisma.subject.create({ data: { schoolId, code: 'GDTC', name: 'Giáo dục thể chất' } })).id;
    await prisma.subjectSetting.create({ data: { schoolId, subjectId: gdtc, assessment: 'COMMENT', regularCount: 2 } });
    students = [];
    for (const name of ['Lê Thành An', 'Trần Đại An', 'Nguyễn Phương Anh']) students.push(await createStudent(app, schoolId, { classId, fullName: name }));
    parent = await createParent(app, schoolId, [students[0].student.id]);
    await prisma.timetableEntry.createMany({
      data: [
        { schoolId, academicYearId: yearId, semester: 1, classId, subjectId: toan, teacherId, dayOfWeek: 2, periodNumber: 1 },
        { schoolId, academicYearId: yearId, semester: 1, classId, subjectId: gdtc, teacherId, dayOfWeek: 3, periodNumber: 2 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('column locks', () => {
    it('locks one TX column of a grade level and reopens it', async () => {
      const id = students[0].student.id;
      await api().post('/api/v1/grades/column-locks').set(teacher()).send({ semester: 1, gradeLevel: 9, kind: 'TX', index: 2 }).expect(403);
      const locks = await api().post('/api/v1/grades/column-locks').set(admin()).send({ semester: 1, gradeLevel: 9, subjectId: toan, kind: 'TX', index: 2 }).expect(201);
      expect(locks.body).toEqual([expect.objectContaining({ gradeLevel: 9, subjectName: 'Toán', kind: 'TX', index: 2, column: 'TX2' })]);
      // Locking the same column twice keeps one lock.
      await api().post('/api/v1/grades/column-locks').set(admin()).send({ semester: 1, gradeLevel: 9, subjectId: toan, kind: 'TX', index: 2 }).expect(201);
      expect(await prisma.gradeColumnLock.count({ where: { schoolId } })).toBe(1);

      await save([{ studentId: id, kind: 'TX', index: 1, value: 8 }]).expect(200);
      const blocked = await save([{ studentId: id, kind: 'TX', index: 2, value: 8 }]).expect(400);
      expect(blocked.body.message).toContain('TX2');
      // Admins are bound by the lock too; GDTC is not covered by a Toán lock.
      await save([{ studentId: id, kind: 'TX', index: 2, value: 8 }], admin()).expect(400);
      await save([{ studentId: id, kind: 'TX', index: 2, passed: true }], teacher(), gdtc).expect(200);

      const book = await api().get('/api/v1/grades/book').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).expect(200);
      expect(book.body.lockedColumns).toEqual([{ kind: 'TX', index: 2 }]);

      await api().delete(`/api/v1/grades/column-locks/${locks.body[0].id}`).set(admin()).expect(200);
      await save([{ studentId: id, kind: 'TX', index: 2, value: 8 }]).expect(200);
    });

    it('locks every column of a kind in every subject', async () => {
      const id = students[1].student.id;
      const res = await api().post('/api/v1/grades/column-locks').set(admin()).send({ semester: 1, gradeLevel: 9, kind: 'CK' }).expect(201);
      await save([{ studentId: id, kind: 'CK', index: 1, value: 7 }]).expect(400);
      await save([{ studentId: id, kind: 'CK', index: 1, passed: true }], teacher(), gdtc).expect(400);
      // Other grade levels are untouched.
      const other = await api().get('/api/v1/grades/column-locks').query({ semester: 1, gradeLevel: 6 }).set(teacher()).expect(200);
      expect(other.body).toEqual([]);
      await api().delete(`/api/v1/grades/column-locks/${res.body[0].id}`).set(admin()).expect(200);
    });
  });

  describe('entry window and edit limit', () => {
    afterEach(async () => {
      await api().put('/api/v1/grades/entry-windows').set(admin()).send({ semester: 1, opensAt: null, closesAt: null, maxEdits: null }).expect(200);
    });

    it('keeps teachers out after the window closes but lets the office in', async () => {
      const id = students[2].student.id;
      await api().put('/api/v1/grades/entry-windows').set(admin()).send({ semester: 1, opensAt: '2026-11-02T00:00:00Z', closesAt: '2026-11-01T00:00:00Z' }).expect(400);
      await api().put('/api/v1/grades/entry-windows').set(admin()).send({ semester: 1, opensAt: '2020-01-01T00:00:00Z', closesAt: '2020-02-01T00:00:00Z' }).expect(200);
      const windows = await api().get('/api/v1/grades/entry-windows').set(teacher()).expect(200);
      expect(windows.body[0]).toMatchObject({ semester: 1, closesAt: '2020-02-01T00:00:00.000Z', maxEdits: null });
      const res = await save([{ studentId: id, kind: 'TX', index: 1, value: 6 }]).expect(403);
      expect(res.body.message).toBe('Ngoài thời gian nhập điểm của học kỳ');
      await save([{ studentId: id, kind: 'TX', index: 1, value: 6 }], admin()).expect(200);
    });

    it('limits how often a teacher changes an entered mark', async () => {
      const id = students[2].student.id;
      await api().put('/api/v1/grades/entry-windows').set(admin()).send({ semester: 1, maxEdits: 1 }).expect(200);
      await save([{ studentId: id, kind: 'GK', index: 1, value: 5 }]).expect(200); // first entry is not an edit
      await save([{ studentId: id, kind: 'GK', index: 1, value: 5.5 }]).expect(200); // edit 1
      await save([{ studentId: id, kind: 'GK', index: 1, value: 5.5 }]).expect(200); // no change
      const res = await save([{ studentId: id, kind: 'GK', index: 1, value: 6 }]).expect(403);
      expect(res.body.message).toContain('1 lần');
      await save([{ studentId: id, kind: 'GK', index: 1, value: 6 }], admin()).expect(200);
    });
  });

  describe('edit log', () => {
    it('records each change with who made it', async () => {
      const res = await api().get('/api/v1/grades/edits').query({ semester: 1, subjectId: toan, changesOnly: true }).set(admin()).expect(200);
      const gk = res.body.filter((e: any) => e.column === 'GK' && e.studentName === 'Nguyễn Phương Anh');
      expect(gk.map((e: any) => [e.oldValue, e.newValue])).toEqual([
        ['5,5', '6,0'],
        ['5,0', '5,5'],
      ]);
      expect(gk[1]).toMatchObject({ editedBy: 'TEACHER', source: 'MANUAL', isChange: true, class: '9/11', subject: 'Toán' });
      const all = await api().get('/api/v1/grades/edits').query({ semester: 1 }).set(admin()).expect(200);
      expect(all.body.length).toBeGreaterThan(res.body.length);
      await api().get('/api/v1/grades/edits').query({ semester: 1 }).set(teacher()).expect(403);
    });
  });

  describe('exemptions', () => {
    it('takes an exempt subject out of the results', async () => {
      const id = students[0].student.id;
      await save(full(id, 8)).expect(200);
      await save([1, 2].map((index) => ({ studentId: id, kind: 'TX', index, passed: true })).concat([{ studentId: id, kind: 'GK', index: 1, passed: false } as any, { studentId: id, kind: 'CK', index: 1, passed: false } as any]), teacher(), gdtc).expect(200);
      const before = await api().get('/api/v1/grades/results').query({ classId, semester: 1 }).set(admin()).expect(200);
      expect(before.body.students.find((s: any) => s.id === id).academic).toBe('DAT'); // one Chưa đạt comment subject

      await api().post('/api/v1/grades/exemptions').set(teacher()).send({ studentId: id, subjectId: gdtc, semester: 0, reason: 'Giấy khám bệnh' }).expect(403);
      const ex = await api().post('/api/v1/grades/exemptions').set(admin()).send({ studentId: id, subjectId: gdtc, semester: 0, reason: 'Giấy khám bệnh' }).expect(201);
      const after = await api().get('/api/v1/grades/results').query({ classId, semester: 1 }).set(admin()).expect(200);
      const row = after.body.students.find((s: any) => s.id === id);
      expect(row.subjects.find((x: any) => x.subjectId === gdtc)).toMatchObject({ exempt: true, passed: null });
      expect(row.academic).toBe('TOT');

      const book = await api().get('/api/v1/grades/book').query({ classId, subjectId: gdtc, semester: 1 }).set(teacher()).expect(200);
      expect(book.body.students.find((s: any) => s.id === id).exempt).toBe(true);
      const rejected = await save([{ studentId: id, kind: 'CK', index: 1, passed: true }], teacher(), gdtc).expect(400);
      expect(rejected.body.message).toContain('miễn học');

      const list = await api().get('/api/v1/grades/exemptions').query({ classId }).set(teacher()).expect(200);
      expect(list.body).toEqual([expect.objectContaining({ semester: 0, reason: 'Giấy khám bệnh', subject: expect.objectContaining({ name: 'Giáo dục thể chất' }) })]);

      await api().delete(`/api/v1/grades/exemptions/${ex.body.id}`).set(admin()).expect(200);
      const back = await api().get('/api/v1/grades/results').query({ classId, semester: 1 }).set(admin()).expect(200);
      expect(back.body.students.find((s: any) => s.id === id).academic).toBe('DAT');
      await api().post('/api/v1/grades/exemptions').set(admin()).send({ studentId: id, subjectId: gdtc, semester: 1 }).expect(201);
    });
  });

  describe('visibility', () => {
    afterAll(async () => {
      await prisma.gradeVisibility.deleteMany({ where: { schoolId } });
    });

    it('hides what the school chooses from parents and students', async () => {
      const id = students[0].student.id;
      const shown = await api().get(`/api/v1/parent/children/${id}/grades`).query({ semester: 1 }).set(bearer(parent.token)).expect(200);
      const toanRow = shown.body.subjects.find((s: any) => s.subjectId === toan);
      expect(toanRow).toMatchObject({ marks: { GK: 8, CK: 8 }, average: 8 });
      expect(shown.body.subjects.find((s: any) => s.subjectId === gdtc)).toMatchObject({ exempt: true });

      await api().put('/api/v1/grades/visibility').set(teacher()).send({ averages: false }).expect(403);
      const v = await api().put('/api/v1/grades/visibility').set(admin()).send({ averages: false, examMarks: false, absences: false }).expect(200);
      expect(v.body).toMatchObject({ averages: false, examMarks: false, absences: false, regularMarks: true });
      const hidden = await api().get(`/api/v1/parent/children/${id}/grades`).query({ semester: 1 }).set(bearer(parent.token)).expect(200);
      expect(hidden.body.subjects.find((s: any) => s.subjectId === toan)).toMatchObject({ marks: { TX: [8, 8, 8], GK: null, CK: null }, average: null });
      // Hidden absences come back empty, not as 0 days.
      expect(hidden.body.term).toMatchObject({ absentDays: null });
      const own = await api().get('/api/v1/student/grades').query({ semester: 1 }).set(bearer(students[0].token)).expect(200);
      expect(own.body.subjects.find((s: any) => s.subjectId === toan).average).toBeNull();

      await api().put('/api/v1/grades/visibility').set(admin()).send({ averages: true, examMarks: true, absences: true, onlyAfterLock: true }).expect(200);
      const locked = await api().get(`/api/v1/parent/children/${id}/grades`).query({ semester: 1 }).set(bearer(parent.token)).expect(200);
      expect(locked.body).toMatchObject({ hidden: true, subjects: [] });
    });
  });

  describe('monitoring', () => {
    it('counts entered marks per teacher, class and subject', async () => {
      const res = await api().get('/api/v1/grades/monitor').query({ semester: 1 }).set(admin()).expect(200);
      const t = res.body.rows.find((r: any) => r.subjectName === 'Toán');
      // 3 students × (3 TX + GK + CK) = 15 expected.
      expect(t).toMatchObject({ teacherName: 'Phan Thị Thu', className: '9/11', students: 3, expected: 15 });
      expect(t.entered).toBeGreaterThan(0);
      // The exempt student drops out of GDTC: 2 × (2 + 2).
      expect(res.body.rows.find((r: any) => r.subjectName === 'Giáo dục thể chất')).toMatchObject({ students: 2, expected: 8 });
      await api().get('/api/v1/grades/monitor').query({ semester: 1 }).set(teacher()).expect(403);

      const missing = await api().get('/api/v1/grades/monitor/missing').query({ classId, semester: 1 }).set(teacher()).expect(200);
      const binh = missing.body.rows.find((r: any) => r.fullName === 'Trần Đại An' && r.subject === 'Toán');
      expect(binh.missing).toEqual(['TX1', 'TX2', 'TX3', 'GK', 'CK']);
      expect(missing.body.rows.some((r: any) => r.fullName === 'Lê Thành An' && r.subject === 'Giáo dục thể chất')).toBe(false);
    });
  });

  describe('Excel import', () => {
    it('round-trips the subject score sheet', async () => {
      const file = await api().get('/api/v1/reports/subject-scores').query({ classId, subjectId: toan, semester: 1, format: 'xlsx' }).set(teacher()).buffer(true).parse(binary).expect(200);
      expect(file.headers['content-type']).toContain('spreadsheetml');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.body);
      const ws = wb.worksheets[0];
      let header = 0;
      ws.eachRow((row, n) => {
        if (!header && row.values && (row.values as unknown[]).includes('Mã HS')) header = n;
      });
      expect(header).toBeGreaterThan(0);
      const codeCol = (ws.getRow(header).values as unknown[]).indexOf('Mã HS');
      const gkCol = (ws.getRow(header).values as unknown[]).indexOf('GK');
      const tx1Col = (ws.getRow(header).values as unknown[]).indexOf('TX1');
      for (let r = header + 1; r <= ws.rowCount; r++) {
        const code = ws.getRow(r).getCell(codeCol).value;
        if (code === students[1].student.code) {
          ws.getRow(r).getCell(gkCol).value = '7,5';
          ws.getRow(r).getCell(tx1Col).value = 9;
        }
      }
      const edited = Buffer.from(await wb.xlsx.writeBuffer());

      const dry = await api().post('/api/v1/grades/book/import').query({ classId, subjectId: toan, semester: 1, dryRun: true }).set(teacher()).attach('file', edited, 'bang-diem.xlsx').expect(200);
      expect(dry.body).toMatchObject({ saved: false, changes: 2, errors: [] });
      const before = await prisma.score.count({ where: { studentId: students[1].student.id, subjectId: toan } });
      expect(before).toBe(0);

      const res = await api().post('/api/v1/grades/book/import').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).attach('file', edited, 'bang-diem.xlsx').expect(200);
      expect(res.body).toMatchObject({ saved: true, changes: 2 });
      const book = await api().get('/api/v1/grades/book').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).expect(200);
      expect(book.body.students.find((s: any) => s.id === students[1].student.id).marks).toMatchObject({ TX: [9, null, null], GK: 7.5 });
      const log = await prisma.scoreEdit.findMany({ where: { studentId: students[1].student.id, source: 'IMPORT' } });
      expect(log).toHaveLength(2);
    });

    it('reports bad rows without saving', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('x');
      ws.addRow(['STT', 'Mã HS', 'Họ và tên', 'TX1', 'GK']);
      ws.addRow([1, 'KHONGCO', 'Ai đó', 8, 8]);
      ws.addRow([2, students[2].student.code, 'Nguyễn Phương Anh', 11, 'tám']);
      const res = await api().post('/api/v1/grades/book/import').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).attach('file', Buffer.from(await wb.xlsx.writeBuffer()), 'x.xlsx').expect(200);
      expect(res.body.saved).toBe(false);
      expect(res.body.errors).toHaveLength(3);
      await api().post('/api/v1/grades/book/import').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).attach('file', Buffer.from('not excel'), 'x.xlsx').expect(400);
    });
  });

  describe('reports', () => {
    it('lists the catalogue', async () => {
      const office = await api().get('/api/v1/reports').set(admin()).expect(200);
      expect(office.body.map((r: any) => r.key)).toEqual(expect.arrayContaining(['class-list', 'subject-scores', 'class-results', 'transcript', 'entry-monitoring', 'score-edits']));
      // Monitoring and the edit log are for the office, as on the gradebook control screens.
      const own = await api().get('/api/v1/reports').set(teacher()).expect(200);
      expect(own.body.map((r: any) => r.key)).toEqual(expect.arrayContaining(['class-list', 'subject-scores', 'missing-scores']));
      expect(own.body.map((r: any) => r.key)).not.toContain('entry-monitoring');
      expect(own.body.map((r: any) => r.key)).not.toContain('score-edits');
      await api().get('/api/v1/reports/score-edits').query({ semester: 1 }).set(teacher()).expect(403);
      await api().get('/api/v1/reports/entry-monitoring').query({ semester: 1 }).set(teacher()).expect(403);
    });

    it('builds every report as a preview and as PDF and Excel', async () => {
      const params: Record<string, Record<string, unknown>> = {
        'class-list': { classId },
        'students-by-status': { status: 'TRANSFERRED' },
        'student-stats': {},
        absences: { from: '2026-09-01', to: '2026-10-31' },
        exemptions: {},
        'subject-scores': { classId, subjectId: toan, semester: 1 },
        'class-results': { classId, semester: 1 },
        'score-distribution': { subjectId: toan, semester: 1 },
        'level-stats': { semester: 1, gradeLevel: 9 },
        titles: {},
        promotion: { promotion: 'RETEST' },
        transcript: { studentId: students[0].student.id },
        'entry-monitoring': { semester: 1 },
        'missing-scores': { classId, semester: 1 },
        'score-edits': { semester: 1 },
      };
      const catalogue = await api().get('/api/v1/reports').set(admin()).expect(200);
      for (const { key } of catalogue.body) {
        expect(params[key]).toBeDefined();
        const json = await api().get(`/api/v1/reports/${key}`).query(params[key]).set(admin());
        expect([key, json.status]).toEqual([key, 200]);
        expect(json.body.letterhead).toMatchObject({ schoolName: `Trường GC${run}`, governingBody: 'UBND phường Bình Phước', signerName: 'Trịnh Thị Mai', place: 'Đồng Nai' });
        const pdf = await api().get(`/api/v1/reports/${key}`).query({ ...params[key], format: 'pdf' }).set(admin()).buffer(true).parse(binary).expect(200);
        expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
        const xlsx = await api().get(`/api/v1/reports/${key}`).query({ ...params[key], format: 'xlsx' }).set(admin()).buffer(true).parse(binary).expect(200);
        expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
      }
    });

    it('shows marks, exemptions and statistics in the documents', async () => {
      const scores = await api().get('/api/v1/reports/subject-scores').query({ classId, subjectId: toan, semester: 1 }).set(teacher()).expect(200);
      const t = scores.body.document.blocks[0];
      expect(t.columns.map((c: any) => c.header)).toEqual(['STT', 'Mã HS', 'Họ và tên', 'TX1', 'TX2', 'TX3', 'GK', 'CK', 'ĐTBmhk', 'Ghi chú']);
      expect(t.rows.find((r: any[]) => r[2] === 'Lê Thành An').slice(3, 9)).toEqual(['8,0', '8,0', '8,0', '8,0', '8,0', '8,0']);
      const results = await api().get('/api/v1/reports/class-results').query({ classId, semester: 1 }).set(teacher()).expect(200);
      expect(results.body.document.blocks[0].rows.find((r: any[]) => r[1] === 'Lê Thành An')).toContain('MG');
      const dist = await api().get('/api/v1/reports/score-distribution').query({ subjectId: toan, semester: 1 }).set(teacher()).expect(200);
      // Lê Thành An averages 8.0 -> the 8–10 band.
      expect(dist.body.document.blocks[0].rows[0]).toEqual([1, '9/11', 1, 0, '0%', 0, '0%', 0, '0%', 0, '0%', 1, '100%']);
    });

    it('takes the letterhead from the school profile', async () => {
      await api().patch('/api/v1/school').set(admin()).send({ province: 'Tỉnh Đồng Nai', locality: '', principalName: 'Nguyễn Văn Bình' }).expect(200);
      const res = await api().get('/api/v1/reports/class-list').query({ classId }).set(teacher()).expect(200);
      // A cleared place falls back to the province; the signer can be overridden per report.
      expect(res.body.letterhead).toMatchObject({ place: 'Tỉnh Đồng Nai', signerName: 'Nguyễn Văn Bình', signerTitle: 'Hiệu trưởng', governingBody: 'UBND phường Bình Phước' });
      const signed = await api().get('/api/v1/reports/class-list').query({ classId, signerTitle: 'KT. Hiệu trưởng', signerName: 'Lê Văn Phó' }).set(teacher()).expect(200);
      expect(signed.body.letterhead).toMatchObject({ signerTitle: 'KT. Hiệu trưởng', signerName: 'Lê Văn Phó' });
      await api().patch('/api/v1/school').set(admin()).send({ locality: 'Đồng Nai', principalName: 'Trịnh Thị Mai' }).expect(200);
    });

    it('validates parameters', async () => {
      const res = await api().get('/api/v1/reports/subject-scores').query({ classId }).set(teacher()).expect(400);
      expect(res.body.message).toContain('môn học');
      await api().get('/api/v1/reports/subject-scores').query({ classId, subjectId: toan, semester: 0 }).set(teacher()).expect(400);
      await api().get('/api/v1/reports/nope').set(teacher()).expect(404);
      await api().get('/api/v1/reports/class-list').query({ classId }).set(bearer(parent.token)).expect(403);
    });
  });
});

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssessmentType, NotificationKind, Prisma, PromotionStatus, ResultLevel, Role, ScoreEditSource, ScoreKind, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { serializeCsv } from '../admissions/csv';
import { AuthUser } from '../common/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookQuery, LockDto, ResultsQuery, SaveBookDto, ScoreEntryDto, SubjectSettingDto, UpdateResultDto } from './grades.dto';
import { cellKey, columnLabel, GradeControlService, lockCovers, Visibility } from './control.service';
import { readXlsx } from '../reports/xlsx';
import { DEFAULT_SETTING, loadSettings, MarkSheet, num, orderSubjects, recomputeResults, sheetOutcome, SubjectSettingLike, toMarkSheet } from './results';
import { assertMark, formatMark, passedLabel, regularCountFor, reviewKind, TITLE_EXCELLENT, TITLE_GOOD, YEAR } from './tt22';

export const LOCKED_MESSAGE = 'Sổ điểm học kỳ này đã khóa';
const HOMEROOM_ONLY = 'Chỉ giáo viên chủ nhiệm lớp mới được sửa kết quả';
const WEEKS_PER_YEAR = 35;
// Semicolon-separated so decimal commas (8,5) stay unquoted and Excel vi-VN opens the file as is.
const CSV_OPTIONS = { bom: true, delimiter: ';' as const };

const studentSelect = { id: true, code: true, fullName: true } as const;
const subjectSelect = { id: true, code: true, name: true } as const;
const classSelect = { id: true, name: true, gradeLevel: true, academicYearId: true, homeroomTeacherId: true } as const;
const termSelect = {
  semester: true,
  academic: true,
  conduct: true,
  title: true,
  promotion: true,
  absentDays: true,
  homeroomComment: true,
  academicAfterRetake: true,
  conductAfterTraining: true,
  promotionOverride: true,
} as const;

type ClassRef = Prisma.ClassGetPayload<{ select: typeof classSelect }>;
type SubjectRef = Prisma.SubjectGetPayload<{ select: typeof subjectSelect }>;
type SubjectView = SubjectRef & SubjectSettingLike;

const levelCounts = () => ({ TOT: 0, KHA: 0, DAT: 0, CHUA_DAT: 0, pending: 0 });
const count = (counts: ReturnType<typeof levelCounts>, level: ResultLevel | null) => {
  if (level) counts[level]++;
  else counts.pending++;
};
const semesterLabel = (s: number) => (s === YEAR ? 'Cả năm' : `Học kỳ ${s}`);
const kindLabel = (k: ScoreKind) => (k === ScoreKind.GK ? 'giữa kỳ' : k === ScoreKind.CK ? 'cuối kỳ' : 'thường xuyên');

/** Sổ điểm (gradebook), kết quả học tập and học bạ per Thông tư 22/2021. */
@Injectable()
export class GradesService {
  private readonly logger = new Logger(GradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly years: AcademicYearsService,
    private readonly control: GradeControlService,
  ) {}

  // ---- lookups ----

  private async getClass(schoolId: string, classId: string): Promise<ClassRef> {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: classSelect });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    return klass;
  }

  private async getSubject(schoolId: string, subjectId: string): Promise<SubjectRef> {
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: subjectSelect });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');
    return subject;
  }

  /** Every subject of the school with its assessment setting, in display order. */
  private async subjectsWithSettings(schoolId: string): Promise<SubjectView[]> {
    const [subjects, settings] = await Promise.all([this.prisma.subject.findMany({ where: { schoolId }, select: subjectSelect }), loadSettings(this.prisma, schoolId)]);
    return orderSubjects(subjects).map((s) => ({ ...s, ...(settings.get(s.id) ?? DEFAULT_SETTING) }));
  }

  private async settingOf(schoolId: string, subjectId: string): Promise<SubjectSettingLike> {
    const s = await this.prisma.subjectSetting.findUnique({ where: { schoolId_subjectId: { schoolId, subjectId } }, select: { assessment: true, regularCount: true } });
    return s ?? DEFAULT_SETTING;
  }

  private roster(classId: string) {
    return this.prisma.enrollment.findMany({
      where: { classId, student: { status: StudentStatus.STUDYING } },
      select: { student: { select: { ...studentSelect, userId: true } } },
      orderBy: { student: { fullName: 'asc' } },
    });
  }

  private async isLocked(classId: string, semester: number): Promise<boolean> {
    if (semester === YEAR) {
      const n = await this.prisma.gradeLock.count({ where: { classId, semester: { in: [1, 2] } } });
      return n === 2;
    }
    return !!(await this.prisma.gradeLock.findUnique({ where: { classId_semester: { classId, semester } }, select: { id: true } }));
  }

  private teacherOf(user: AuthUser) {
    return this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true } });
  }

  /** Office staff may edit any class's results; a teacher only their homeroom class. */
  private async assertHomeroom(user: AuthUser, klass: { homeroomTeacherId: string | null }) {
    if (user.role !== Role.TEACHER) return;
    const teacher = await this.teacherOf(user);
    if (!teacher || klass.homeroomTeacherId !== teacher.id) throw new ForbiddenException(HOMEROOM_ONLY);
  }

  // ---- settings ----

  async settings(schoolId: string) {
    const [subjects, year] = await Promise.all([this.subjectsWithSettings(schoolId), this.years.current(schoolId)]);
    const settings = await this.prisma.subjectSetting.findMany({ where: { schoolId }, select: { subjectId: true, periodsPerYear: true } });
    const periods = new Map(settings.map((s) => [s.subjectId, s.periodsPerYear]));
    // Weekly periods of the first class teaching the subject in semester 1 of the current year, × 35 weeks.
    const entries = await this.prisma.timetableEntry.groupBy({
      by: ['subjectId', 'classId'],
      where: { schoolId, academicYearId: year.id, semester: 1 },
      _count: { _all: true },
      orderBy: [{ subjectId: 'asc' }, { classId: 'asc' }],
    });
    const perWeek = new Map<string, number>();
    for (const e of entries) if (!perWeek.has(e.subjectId)) perWeek.set(e.subjectId, e._count._all);
    return subjects.map((s) => {
      const weekly = perWeek.get(s.id);
      const suggestedPeriodsPerYear = weekly ? weekly * WEEKS_PER_YEAR : null;
      const basis = periods.get(s.id) ?? suggestedPeriodsPerYear;
      return {
        subjectId: s.id,
        code: s.code,
        name: s.name,
        assessment: s.assessment,
        regularCount: s.regularCount,
        periodsPerYear: periods.get(s.id) ?? null,
        suggestedPeriodsPerYear,
        suggestedRegularCount: basis ? regularCountFor(basis) : null,
      };
    });
  }

  async saveSetting(schoolId: string, subjectId: string, dto: SubjectSettingDto) {
    const subject = await this.getSubject(schoolId, subjectId);
    const data = { assessment: dto.assessment, regularCount: dto.regularCount, periodsPerYear: dto.periodsPerYear ?? null };
    const row = await this.prisma.subjectSetting.upsert({
      where: { schoolId_subjectId: { schoolId, subjectId } },
      create: { schoolId, subjectId, ...data },
      update: data,
    });
    return { subjectId, code: subject.code, name: subject.name, assessment: row.assessment, regularCount: row.regularCount, periodsPerYear: row.periodsPerYear };
  }

  // ---- gradebook ----

  async book(schoolId: string, query: BookQuery) {
    const [klass, subject] = await Promise.all([this.getClass(schoolId, query.classId), this.getSubject(schoolId, query.subjectId)]);
    return this.buildBook(schoolId, klass, subject, query.semester);
  }

  private async buildBook(schoolId: string, klass: ClassRef, subject: SubjectRef, semester: number) {
    const [setting, locked, roster, scores, columnLocks, window, exemptions] = await Promise.all([
      this.settingOf(schoolId, subject.id),
      this.isLocked(klass.id, semester),
      this.roster(klass.id),
      this.prisma.score.findMany({
        where: { classId: klass.id, subjectId: subject.id, academicYearId: klass.academicYearId, semester },
        select: { studentId: true, subjectId: true, semester: true, kind: true, index: true, value: true, passed: true, note: true },
      }),
      this.control.locksFor(schoolId, klass.academicYearId, semester, klass.gradeLevel, subject.id),
      this.control.window(schoolId, klass.academicYearId, semester),
      this.exemptStudents(klass.academicYearId, subject.id, semester),
    ]);
    const lockedColumns = [
      ...Array.from({ length: setting.regularCount }, (_, i) => ({ kind: ScoreKind.TX, index: i + 1 })),
      { kind: ScoreKind.GK, index: 1 },
      { kind: ScoreKind.CK, index: 1 },
    ].filter((c) => columnLocks.some((l) => lockCovers(l, klass.gradeLevel, subject.id, c.kind, c.index)));
    const byStudent = new Map<string, typeof scores>();
    for (const s of scores) {
      const list = byStudent.get(s.studentId);
      if (list) list.push(s);
      else byStudent.set(s.studentId, [s]);
    }
    const students = roster.map(({ student }) => {
      const rows = byStudent.get(student.id) ?? [];
      const sheet = toMarkSheet(rows, setting.regularCount);
      const outcome = sheetOutcome(sheet, setting);
      // The per-student note lives on the end-of-term row.
      const note = rows.find((r) => r.kind === ScoreKind.CK)?.note ?? null;
      return {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        marks: { TX: sheet.TX, GK: sheet.GK, CK: sheet.CK },
        passed: sheet.passed,
        average: outcome.average,
        passedResult: outcome.passed,
        note,
        exempt: exemptions.has(student.id),
      };
    });
    return {
      class: { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, academicYearId: klass.academicYearId },
      subject,
      semester,
      setting,
      locked,
      lockedColumns,
      window,
      students,
    };
  }

  async saveBook(user: AuthUser, dto: SaveBookDto, source: ScoreEditSource = ScoreEditSource.MANUAL) {
    const schoolId = user.schoolId;
    const [klass, subject, setting] = await Promise.all([this.getClass(schoolId, dto.classId), this.getSubject(schoolId, dto.subjectId), this.settingOf(schoolId, dto.subjectId)]);
    if (await this.isLocked(klass.id, dto.semester)) throw new BadRequestException(LOCKED_MESSAGE);
    const roster = await this.roster(klass.id);
    const known = new Map(roster.map((r) => [r.student.id, r.student]));
    const entries = dto.entries.map((e) => this.normalizeEntry(e, setting, known));
    const teacher = await this.teacherOf(user);
    const studentIds = [...new Set(entries.map((e) => e.studentId))];
    const exempt = await this.exemptStudents(klass.academicYearId, subject.id, dto.semester);
    const exemptEntry = entries.find((e) => exempt.has(e.studentId) && (e.value !== undefined || e.passed !== undefined));
    if (exemptEntry) throw new BadRequestException(`${known.get(exemptEntry.studentId)?.fullName ?? 'Học sinh'} được miễn học môn này`);

    // Snapshot the touched cells: the edit log, the edit limit and GK/CK notifications compare against it.
    const before = await this.prisma.score.findMany({
      where: { classId: klass.id, subjectId: subject.id, academicYearId: klass.academicYearId, semester: dto.semester, studentId: { in: studentIds } },
      select: { studentId: true, kind: true, index: true, value: true, passed: true },
    });
    const cells = new Map(before.map((b) => [cellKey(b.studentId, b.kind, b.index), { value: num(b.value), passed: b.passed }]));
    const prior = new Map(before.filter((b) => b.kind !== ScoreKind.TX).map((b) => [`${b.studentId}|${b.kind}`, { value: num(b.value), passed: b.passed }]));
    const marked = entries.filter((e) => e.value !== undefined || e.passed !== undefined);
    await this.control.assertCanWrite(user, { academicYearId: klass.academicYearId, semester: dto.semester, gradeLevel: klass.gradeLevel, subjectId: subject.id, classId: klass.id }, marked, cells);
    const edits = marked.flatMap((e) => {
      const old = cells.get(cellKey(e.studentId, e.kind, e.index)) ?? { value: null, passed: null };
      const value = e.value === undefined ? old.value : e.value;
      const passed = e.passed === undefined ? old.passed : e.passed;
      if (value === old.value && passed === old.passed) return [];
      return [{ schoolId, academicYearId: klass.academicYearId, semester: dto.semester, classId: klass.id, studentId: e.studentId, subjectId: subject.id, kind: e.kind, index: e.index, oldValue: old.value, newValue: value, oldPassed: old.passed, newPassed: passed, editedById: user.userId, source }];
    });

    await this.prisma.$transaction(
      entries.map((e) => {
        const where = { studentId_subjectId_academicYearId_semester_kind_index: { studentId: e.studentId, subjectId: subject.id, academicYearId: klass.academicYearId, semester: dto.semester, kind: e.kind, index: e.index } };
        const patch: Prisma.ScoreUpdateInput = { teacher: teacher ? { connect: { id: teacher.id } } : undefined };
        if (e.value !== undefined) patch.value = e.value;
        if (e.passed !== undefined) patch.passed = e.passed;
        if (e.note !== undefined) patch.note = e.note;
        return this.prisma.score.upsert({
          where,
          create: {
            schoolId,
            academicYearId: klass.academicYearId,
            semester: dto.semester,
            classId: klass.id,
            studentId: e.studentId,
            subjectId: subject.id,
            kind: e.kind,
            index: e.index,
            value: e.value ?? null,
            passed: e.passed ?? null,
            note: e.note ?? null,
            teacherId: teacher?.id ?? null,
          },
          update: patch,
        });
      }),
    );
    if (edits.length) await this.prisma.scoreEdit.createMany({ data: edits });

    await recomputeResults(this.prisma, { schoolId, academicYearId: klass.academicYearId, classId: klass.id, studentIds, subjectIds: [subject.id] });

    // One alert per student whose mid-term or end-of-term mark changed (CK wins when both did).
    for (const studentId of studentIds) {
      const changed = entries
        .filter((e) => e.studentId === studentId && e.kind !== ScoreKind.TX)
        .filter((e) => {
          const old = prior.get(`${studentId}|${e.kind}`);
          const value = e.value === undefined ? (old?.value ?? null) : e.value;
          const passed = e.passed === undefined ? (old?.passed ?? null) : e.passed;
          return value !== (old?.value ?? null) || passed !== (old?.passed ?? null);
        })
        .sort((a, b) => (a.kind === ScoreKind.CK ? -1 : b.kind === ScoreKind.CK ? 1 : 0));
      const top = changed[0];
      if (!top) continue;
      const shown = setting.assessment === AssessmentType.COMMENT ? (top.passed === undefined ? passedLabel(prior.get(`${studentId}|${top.kind}`)?.passed) : passedLabel(top.passed)) : top.value === undefined ? null : top.value === null ? null : formatMark(top.value);
      if (shown === null) continue;
      const body = `Điểm ${kindLabel(top.kind)} môn ${subject.name} học kỳ ${dto.semester}: ${shown}`;
      const input = { kind: NotificationKind.GRADE_UPDATED, title: 'Cập nhật điểm', body, studentId, data: { classId: klass.id, subjectId: subject.id, semester: dto.semester, kind: top.kind } };
      try {
        await this.notifications.notifyGuardians(schoolId, studentId, input);
        const userId = known.get(studentId)?.userId;
        if (userId) await this.notifications.notifyUsers(schoolId, [userId], input);
      } catch (e) {
        this.logger.warn(`Grade notification failed for student ${studentId}: ${(e as Error).message}`);
      }
    }

    return this.buildBook(schoolId, klass, subject, dto.semester);
  }

  private normalizeEntry(e: ScoreEntryDto, setting: SubjectSettingLike, known: Map<string, unknown>) {
    if (!known.has(e.studentId)) throw new BadRequestException('Học sinh không thuộc lớp này');
    const index = e.kind === ScoreKind.TX ? (e.index ?? 1) : 1;
    if (e.kind === ScoreKind.TX && index > setting.regularCount) throw new BadRequestException(`Môn này chỉ có ${setting.regularCount} điểm thường xuyên mỗi học kỳ`);
    if (setting.assessment === AssessmentType.COMMENT) {
      if (e.value !== undefined && e.value !== null) throw new BadRequestException('Môn đánh giá bằng nhận xét chỉ nhận Đạt / Chưa đạt');
      return { studentId: e.studentId, kind: e.kind, index, value: e.value, passed: e.passed, note: e.note };
    }
    if (e.value !== undefined && e.value !== null) assertMark(e.value);
    if (e.passed !== undefined && e.passed !== null) throw new BadRequestException('Môn đánh giá bằng điểm số không nhận Đạt / Chưa đạt');
    return { studentId: e.studentId, kind: e.kind, index, value: e.value, passed: e.passed, note: e.note };
  }

  async exportBook(schoolId: string, query: BookQuery): Promise<string> {
    const book = await this.book(schoolId, query);
    const n = book.setting.regularCount;
    const comment = book.setting.assessment === AssessmentType.COMMENT;
    const cell = (v: number | null, p: boolean | null) => (comment ? (passedLabel(p) ?? '') : v === null ? '' : formatMark(v));
    const header = ['STT', 'Mã HS', 'Họ và tên', ...Array.from({ length: n }, (_, i) => `TX${i + 1}`), 'GK', 'CK', comment ? 'Kết quả' : 'ĐTB', 'Ghi chú'];
    const rows = book.students.map((s, i) => [
      i + 1,
      s.code,
      s.fullName,
      ...s.marks.TX.map((v, j) => cell(v, s.passed.TX[j])),
      cell(s.marks.GK, s.passed.GK),
      cell(s.marks.CK, s.passed.CK),
      comment ? (passedLabel(s.passedResult) ?? '') : s.average === null ? '' : formatMark(s.average),
      s.note ?? '',
    ]);
    const title = [`Sổ điểm môn ${book.subject.name} - Lớp ${book.class.name} - ${semesterLabel(book.semester)}`];
    return serializeCsv([title, header, ...rows], CSV_OPTIONS);
  }

  private async exemptStudents(academicYearId: string, subjectId: string, semester: number): Promise<Set<string>> {
    const rows = await this.prisma.subjectExemption.findMany({ where: { academicYearId, subjectId, semester: { in: [semester, YEAR] } }, select: { studentId: true } });
    return new Set(rows.map((r) => r.studentId));
  }

  /**
   * Nhập điểm từ Excel: the sheet exported by the subject-scores report (or any
   * sheet with a "Mã HS" column and TX1..n, GK, CK, Ghi chú columns). Empty
   * cells leave the mark as it is. With dryRun nothing is saved.
   */
  async importBook(user: AuthUser, query: BookQuery & { dryRun?: boolean }, buffer: Buffer) {
    let sheet: (string | number | null)[][];
    try {
      sheet = await readXlsx(buffer);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const book = await this.book(user.schoolId, query);
    const comment = book.setting.assessment === AssessmentType.COMMENT;
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const headerAt = sheet.findIndex((row) => row.some((c) => norm(c) === 'mã hs'));
    if (headerAt < 0) throw new BadRequestException('Không tìm thấy cột "Mã HS" trong tệp');
    const header = sheet[headerAt].map(norm);
    const col = (name: string) => header.indexOf(name);
    const codeCol = col('mã hs');
    const columns: { kind: ScoreKind; index: number; at: number }[] = [];
    for (let i = 1; i <= book.setting.regularCount; i++) if (col(`tx${i}`) >= 0) columns.push({ kind: ScoreKind.TX, index: i, at: col(`tx${i}`) });
    if (col('gk') >= 0) columns.push({ kind: ScoreKind.GK, index: 1, at: col('gk') });
    if (col('ck') >= 0) columns.push({ kind: ScoreKind.CK, index: 1, at: col('ck') });
    const noteCol = col('ghi chú');
    if (!columns.length) throw new BadRequestException('Không tìm thấy cột điểm (TX1, GK, CK) trong tệp');

    const byCode = new Map(book.students.map((s) => [s.code.toLowerCase(), s]));
    const entries: ScoreEntryDto[] = [];
    const errors: { row: number; message: string }[] = [];
    let changes = 0;
    for (let r = headerAt + 1; r < sheet.length; r++) {
      const row = sheet[r] ?? [];
      const code = norm(row[codeCol]);
      // The table ends at the first row without a code (notes and the signature follow).
      if (!code) break;
      const student = byCode.get(code);
      if (!student) {
        errors.push({ row: r + 1, message: `Mã HS ${row[codeCol]} không thuộc lớp ${book.class.name}` });
        continue;
      }
      for (const c of columns) {
        const raw = row[c.at];
        if (raw === null || raw === undefined || String(raw).trim() === '') continue;
        const current = c.kind === ScoreKind.TX ? { v: student.marks.TX[c.index - 1], p: student.passed.TX[c.index - 1] } : { v: student.marks[c.kind], p: student.passed[c.kind] };
        if (comment) {
          const t = norm(raw);
          const passed = ['đ', 'đạt', 'd', 'dat'].includes(t) ? true : ['cđ', 'chưa đạt', 'cd', 'chua dat'].includes(t) ? false : null;
          if (passed === null) {
            errors.push({ row: r + 1, message: `${student.fullName}: ${columnLabel(c.kind, c.index)} phải là Đ hoặc CĐ` });
            continue;
          }
          if (passed !== current.p) changes++;
          entries.push({ studentId: student.id, kind: c.kind, index: c.index, passed });
        } else {
          const value = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
          if (!Number.isFinite(value) || value < 0 || value > 10 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-6) {
            errors.push({ row: r + 1, message: `${student.fullName}: ${columnLabel(c.kind, c.index)} "${raw}" không phải điểm 0–10` });
            continue;
          }
          if (value !== current.v) changes++;
          entries.push({ studentId: student.id, kind: c.kind, index: c.index, value });
        }
      }
      if (noteCol >= 0) {
        const note = String(row[noteCol] ?? '').trim();
        if (note && note !== (student.note ?? '')) entries.push({ studentId: student.id, kind: ScoreKind.CK, index: 1, note: note.slice(0, 500) });
      }
    }
    const summary = { students: new Set(entries.map((e) => e.studentId)).size, marks: entries.filter((e) => e.value !== undefined || e.passed !== undefined).length, changes, errors };
    if (query.dryRun || errors.length) return { ...summary, saved: false };
    if (entries.length) await this.saveBook(user, { classId: query.classId, subjectId: query.subjectId, semester: query.semester, entries }, ScoreEditSource.IMPORT);
    return { ...summary, saved: true };
  }

  // ---- results ----

  async results(schoolId: string, query: ResultsQuery) {
    const klass = await this.getClass(schoolId, query.classId);
    return this.buildResults(schoolId, klass, query.semester);
  }

  private async buildResults(schoolId: string, klass: ClassRef, semester: number) {
    const [subjects, roster, locked, subjectResults, terms] = await Promise.all([
      this.subjectsWithSettings(schoolId),
      this.roster(klass.id),
      this.isLocked(klass.id, semester),
      this.prisma.subjectResult.findMany({
        where: { classId: klass.id, academicYearId: klass.academicYearId, semester },
        select: { studentId: true, subjectId: true, average: true, passed: true, exempt: true },
      }),
      this.prisma.termResult.findMany({ where: { classId: klass.id, academicYearId: klass.academicYearId, semester }, select: { studentId: true, ...termSelect } }),
    ]);
    const resultOf = new Map(subjectResults.map((r) => [`${r.studentId}|${r.subjectId}`, r]));
    const termOf = new Map(terms.map((t) => [t.studentId, t]));
    const summary = {
      academic: levelCounts(),
      conduct: levelCounts(),
      titles: { [TITLE_EXCELLENT]: 0, [TITLE_GOOD]: 0 } as Record<string, number>,
      promotion: { PROMOTED: 0, RETEST: 0, RETAINED: 0, pending: 0 },
    };
    const students = roster.map(({ student }) => {
      const term = termOf.get(student.id);
      count(summary.academic, term?.academic ?? null);
      count(summary.conduct, term?.conduct ?? null);
      if (term?.title) summary.titles[term.title] = (summary.titles[term.title] ?? 0) + 1;
      if (semester === YEAR) {
        if (term?.promotion) summary.promotion[term.promotion]++;
        else summary.promotion.pending++;
      }
      return {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        subjects: subjects.map((s) => {
          const r = resultOf.get(`${student.id}|${s.id}`);
          return { subjectId: s.id, code: s.code, name: s.name, assessment: s.assessment, average: num(r?.average), passed: r?.passed ?? null, exempt: r?.exempt ?? false };
        }),
        academic: term?.academic ?? null,
        conduct: term?.conduct ?? null,
        title: term?.title ?? null,
        promotion: term?.promotion ?? null,
        absentDays: term?.absentDays ?? 0,
        homeroomComment: term?.homeroomComment ?? null,
        ...(semester === YEAR
          ? {
              academicAfterRetake: term?.academicAfterRetake ?? null,
              conductAfterTraining: term?.conductAfterTraining ?? null,
              promotionSetByHand: !!term?.promotionOverride,
              review: term?.promotion === PromotionStatus.RETEST ? reviewKind(term.academic, term.conduct) : null,
            }
          : {}),
      };
    });
    return {
      class: { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, academicYearId: klass.academicYearId, homeroomTeacherId: klass.homeroomTeacherId },
      semester,
      locked,
      subjects: subjects.map((s) => ({ subjectId: s.id, code: s.code, name: s.name, assessment: s.assessment })),
      students,
      summary,
    };
  }

  /**
   * Recomputes subject and term results of a class (or some of its students).
   * Both semesters and the year are always refreshed so the year stays
   * consistent; `semester` only says which view the caller is looking at.
   * Exported for the conduct module, which calls it after approving conduct.
   */
  async recomputeTerm(schoolId: string, academicYearId: string, _semester: number, classId: string, studentIds?: string[]) {
    await recomputeResults(this.prisma, { schoolId, academicYearId, classId, studentIds });
  }

  async recompute(schoolId: string, classId: string, semester: number) {
    const klass = await this.getClass(schoolId, classId);
    await this.recomputeTerm(schoolId, klass.academicYearId, semester, klass.id);
    return this.buildResults(schoolId, klass, semester);
  }

  async updateResult(user: AuthUser, studentId: string, dto: UpdateResultDto) {
    const schoolId = user.schoolId;
    const year = await this.years.current(schoolId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: year.id, student: { schoolId } },
      select: { classId: true, class: { select: classSelect } },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy học sinh trong năm học hiện tại');
    const klass = enrollment.class;
    await this.assertHomeroom(user, klass);
    if (dto.promotion !== undefined && dto.semester !== YEAR) throw new BadRequestException('Kết quả lên lớp chỉ áp dụng cho cả năm');

    const data: Prisma.TermResultUncheckedUpdateInput = {};
    if (dto.absentDays !== undefined) data.absentDays = dto.absentDays;
    if (dto.homeroomComment !== undefined) data.homeroomComment = dto.homeroomComment;
    // A promotion set by hand outlives later recomputes until it is cleared with null.
    if (dto.promotion !== undefined) data.promotionOverride = dto.promotion;
    await this.prisma.termResult.upsert({
      where: { studentId_academicYearId_semester: { studentId, academicYearId: year.id, semester: dto.semester } },
      create: {
        schoolId,
        academicYearId: year.id,
        semester: dto.semester,
        classId: klass.id,
        studentId,
        absentDays: dto.absentDays ?? 0,
        homeroomComment: dto.homeroomComment ?? null,
        promotionOverride: dto.promotion ?? null,
      },
      update: data,
    });
    await this.recomputeTerm(schoolId, year.id, dto.semester, klass.id, [studentId]);
    const results = await this.buildResults(schoolId, klass, dto.semester);
    const row = results.students.find((s) => s.id === studentId);
    if (!row) throw new NotFoundException('Không tìm thấy học sinh');
    return row;
  }

  async lock(user: AuthUser, dto: LockDto) {
    const klass = await this.getClass(user.schoolId, dto.classId);
    const row = await this.prisma.gradeLock.upsert({
      where: { classId_semester: { classId: klass.id, semester: dto.semester } },
      create: { schoolId: user.schoolId, academicYearId: klass.academicYearId, semester: dto.semester, classId: klass.id, lockedById: user.userId },
      update: {},
    });
    return { locked: true, lockedAt: row.lockedAt };
  }

  async unlock(schoolId: string, dto: LockDto) {
    const klass = await this.getClass(schoolId, dto.classId);
    await this.prisma.gradeLock.deleteMany({ where: { classId: klass.id, semester: dto.semester } });
    return { locked: false };
  }

  async exportResults(schoolId: string, query: ResultsQuery): Promise<string> {
    const r = await this.results(schoolId, query);
    const year = query.semester === YEAR;
    const header = ['STT', 'Mã HS', 'Họ và tên', ...r.subjects.map((s) => s.name), 'Học tập', 'Rèn luyện', ...(year ? ['Danh hiệu', 'Lên lớp'] : []), 'Nghỉ (buổi)', 'Nhận xét GVCN'];
    const level = (l: ResultLevel | null) => (l ? LEVEL_LABEL[l] : '');
    const rows = r.students.map((s, i) => [
      i + 1,
      s.code,
      s.fullName,
      ...s.subjects.map((x) => (x.exempt ? 'MG' : x.assessment === AssessmentType.COMMENT ? (passedLabel(x.passed) ?? '') : x.average === null ? '' : formatMark(x.average))),
      level(s.academic),
      level(s.conduct),
      ...(year ? [s.title ?? '', promotionLabel(s.promotion, s.academic, s.conduct)] : []),
      s.absentDays,
      s.homeroomComment ?? '',
    ]);
    const title = [`Kết quả học tập - Lớp ${r.class.name} - ${semesterLabel(query.semester)}`];
    return serializeCsv([title, header, ...rows], CSV_OPTIONS);
  }

  // ---- transcript ----

  async transcript(schoolId: string, studentId: string, academicYearId?: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { ...studentSelect, gender: true, dateOfBirth: true } });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    const year = academicYearId
      ? await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true, name: true } })
      : await this.years.current(schoolId);
    if (!year) throw new NotFoundException('Không tìm thấy năm học');
    const [school, enrollment, subjects, results, terms, retakes, training, completion] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, address: true } }),
      this.prisma.enrollment.findFirst({
        where: { studentId, academicYearId: year.id },
        select: { class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { id: true, fullName: true } } } } },
      }),
      this.subjectsWithSettings(schoolId),
      this.prisma.subjectResult.findMany({ where: { studentId, academicYearId: year.id }, select: { subjectId: true, semester: true, average: true, passed: true, exempt: true } }),
      this.prisma.termResult.findMany({ where: { studentId, academicYearId: year.id }, select: termSelect }),
      this.prisma.subjectRetake.findMany({ where: { studentId, academicYearId: year.id }, select: { subjectId: true, score: true, passed: true, note: true } }),
      this.prisma.summerTraining.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: year.id } }, select: { tasks: true, result: true, comment: true } }),
      this.prisma.completionRecord.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
        select: { registerNo: true, recognizedAt: true, round: { select: { round: true, decisionNo: true, decidedOn: true, signerTitle: true, signerName: true } } },
      }),
    ]);
    const cell = (subjectId: string, semester: number) => {
      const r = results.find((x) => x.subjectId === subjectId && x.semester === semester);
      return { average: num(r?.average), passed: r?.passed ?? null, exempt: r?.exempt ?? false };
    };
    const term = (semester: number) => terms.find((t) => t.semester === semester) ?? null;
    return {
      school,
      student,
      class: enrollment?.class ? { id: enrollment.class.id, name: enrollment.class.name, gradeLevel: enrollment.class.gradeLevel } : null,
      academicYear: { id: year.id, name: year.name },
      subjects: subjects.map((s) => ({ subjectId: s.id, code: s.code, name: s.name, assessment: s.assessment, hk1: cell(s.id, 1), hk2: cell(s.id, 2), year: cell(s.id, YEAR) })),
      terms: { hk1: term(1), hk2: term(2), year: term(YEAR) },
      homeroomTeacher: enrollment?.class?.homeroomTeacher ?? null,
      // The summer review (kiểm tra lại, rèn luyện hè) and the principal's confirmation of THCS completion.
      retakes: orderSubjects(subjects)
        .filter((s) => retakes.some((r) => r.subjectId === s.id))
        .map((s) => {
          const r = retakes.find((x) => x.subjectId === s.id)!;
          return { subjectId: s.id, name: s.name, assessment: s.assessment, score: num(r.score), passed: r.passed, note: r.note };
        }),
      training,
      completion: completion?.round ? { ...completion.round, registerNo: completion.registerNo, recognizedAt: completion.recognizedAt } : null,
    };
  }

  // ---- student and parent apps ----

  /** One student's marks and results for a semester (or the year), as the student and parent apps show them. */
  async studentGrades(
    schoolId: string,
    student: { id: string; code: string; fullName: string },
    klass: { id: string; name: string; gradeLevel: number } | null,
    academicYearId: string | null,
    semester: number,
    visibility?: Visibility,
  ) {
    const subjects = await this.subjectsWithSettings(schoolId);
    if (!klass || !academicYearId) return { student, class: klass, semester, subjects: [], term: null, hidden: false };
    if (visibility?.onlyAfterLock && !(await this.isLocked(klass.id, semester))) return { student, class: klass, semester, subjects: [], term: null, hidden: true };
    const full = await this.fullStudentGrades(schoolId, subjects, student, klass, academicYearId, semester);
    return visibility ? applyVisibility(full, visibility) : full;
  }

  async fullStudentGrades(
    schoolId: string,
    subjects: SubjectView[],
    student: { id: string; code: string; fullName: string },
    klass: { id: string; name: string; gradeLevel: number },
    academicYearId: string,
    semester: number,
  ) {
    const [scores, results, term] = await Promise.all([
      semester === YEAR
        ? Promise.resolve([])
        : this.prisma.score.findMany({
            where: { studentId: student.id, academicYearId, semester },
            select: { studentId: true, subjectId: true, semester: true, kind: true, index: true, value: true, passed: true, note: true },
          }),
      this.prisma.subjectResult.findMany({ where: { studentId: student.id, academicYearId }, select: { subjectId: true, semester: true, average: true, passed: true, exempt: true } }),
      this.prisma.termResult.findFirst({ where: { studentId: student.id, academicYearId, semester }, select: termSelect }),
    ]);
    const cell = (subjectId: string, s: number) => {
      const r = results.find((x) => x.subjectId === subjectId && x.semester === s);
      return { average: num(r?.average), passed: r?.passed ?? null, exempt: r?.exempt ?? false };
    };
    const rows = subjects.map((s) => {
      const base = { subjectId: s.id, code: s.code, name: s.name, assessment: s.assessment, regularCount: s.regularCount };
      if (semester === YEAR) return { ...base, hk1: cell(s.id, 1), hk2: cell(s.id, 2), ...cell(s.id, YEAR) };
      const own = scores.filter((x) => x.subjectId === s.id);
      const sheet: MarkSheet = toMarkSheet(own, s.regularCount);
      const outcome = sheetOutcome(sheet, s);
      const exempt = cell(s.id, semester).exempt;
      return { ...base, marks: { TX: sheet.TX, GK: sheet.GK, CK: sheet.CK }, passedMarks: sheet.passed, average: outcome.average, passed: outcome.passed, exempt, note: own.find((x) => x.kind === ScoreKind.CK)?.note ?? null };
    });
    // Hide subjects nobody has marked yet so the app does not list the whole catalogue.
    const shown = rows.filter((r) =>
      'marks' in r
        ? r.exempt || r.marks.TX.some((v) => v !== null) || r.marks.GK !== null || r.marks.CK !== null || r.passedMarks.TX.some((v) => v !== null) || r.passedMarks.GK !== null || r.passedMarks.CK !== null
        : r.exempt || r.hk1.average !== null || r.hk1.passed !== null || r.hk2.average !== null || r.hk2.passed !== null,
    );
    return { student, class: klass, semester, subjects: shown, term, hidden: false };
  }
}

export const LEVEL_LABEL: Record<ResultLevel, string> = { TOT: 'Tốt', KHA: 'Khá', DAT: 'Đạt', CHUA_DAT: 'Chưa đạt' };
export const PROMOTION_LABEL: Record<PromotionStatus, string> = { PROMOTED: 'Được lên lớp', RETEST: 'Kiểm tra lại', RETAINED: 'Ở lại lớp' };

/** The promotion as printed: a RETEST student whose conduct failed does summer training rather than retakes. */
export function promotionLabel(promotion: PromotionStatus | null | undefined, academic: ResultLevel | null | undefined, conduct: ResultLevel | null | undefined): string {
  if (!promotion) return '';
  if (promotion === PromotionStatus.RETEST && reviewKind(academic, conduct) === 'TRAINING') return 'Rèn luyện hè';
  return PROMOTION_LABEL[promotion];
}

type StudentGrades = Awaited<ReturnType<GradesService['fullStudentGrades']>>;
type Term = NonNullable<StudentGrades['term']>;
/** What families get: hidden absences are null rather than a misleading 0. */
type FamilyGrades = Omit<StudentGrades, 'term'> & { term: (Omit<Term, 'absentDays'> & { absentDays: number | null }) | null };

/** Blanks out what the school chose not to show families (cấu hình hiển thị cho phụ huynh, học sinh). */
export function applyVisibility(g: StudentGrades, v: Visibility): FamilyGrades {
  const subjects = g.subjects.map((row) => {
    const r = { ...row } as Record<string, any>;
    if ('marks' in r) {
      r.marks = { TX: v.regularMarks ? r.marks.TX : r.marks.TX.map(() => null), GK: v.examMarks ? r.marks.GK : null, CK: v.examMarks ? r.marks.CK : null };
      r.passedMarks = { TX: v.regularMarks ? r.passedMarks.TX : r.passedMarks.TX.map(() => null), GK: v.examMarks ? r.passedMarks.GK : null, CK: v.examMarks ? r.passedMarks.CK : null };
      if (!v.teacherNotes) r.note = null;
    }
    if (!v.averages) {
      r.average = null;
      r.passed = null;
      for (const k of ['hk1', 'hk2']) if (r[k]) r[k] = { ...r[k], average: null, passed: null };
    }
    return r as (typeof g.subjects)[number];
  });
  const term = g.term
    ? {
        ...g.term,
        academic: v.termResults ? g.term.academic : null,
        conduct: v.termResults ? g.term.conduct : null,
        promotion: v.termResults ? g.term.promotion : null,
        title: v.titles ? g.term.title : null,
        absentDays: v.absences ? g.term.absentDays : null,
        homeroomComment: v.homeroomComment ? g.term.homeroomComment : null,
      }
    : null;
  return { ...g, subjects, term };
}

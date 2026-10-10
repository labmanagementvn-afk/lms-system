import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ScoreKind, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ColumnLockDto, EditLogQuery, EntryWindowDto, ExemptionDto, ExemptionQuery, MissingQuery, MonitorQuery, VisibilityDto } from './control.dto';
import { DEFAULT_SETTING, loadSettings, orderSubjects, recomputeResults } from './results';
import { formatMark, passedLabel, YEAR } from './tt22';

export const COLUMN_LOCKED_MESSAGE = 'Cột điểm này đã bị khóa';
export const WINDOW_CLOSED_MESSAGE = 'Ngoài thời gian nhập điểm của học kỳ';
export const NOT_ASSIGNED_MESSAGE = 'Bạn không được phân công dạy môn này ở lớp này trong học kỳ: chỉ giáo viên được phân công mới nhập điểm';

/** A mark cell a save wants to write. */
export interface CellChange {
  studentId: string;
  kind: ScoreKind;
  index: number;
  value?: number | null;
  passed?: boolean | null;
}

export interface ColumnLockLike {
  gradeLevel: number;
  subjectId: string | null;
  kind: ScoreKind;
  index: number;
}

/** Whether a lock covers the column (kind, index) of a subject in a grade level. */
export function lockCovers(lock: ColumnLockLike, gradeLevel: number, subjectId: string, kind: ScoreKind, index: number): boolean {
  return lock.gradeLevel === gradeLevel && (lock.subjectId === null || lock.subjectId === subjectId) && lock.kind === kind && (lock.index === 0 || lock.index === index);
}

/** "TX2", "GK", "CK" — the column label teachers see. */
export const columnLabel = (kind: ScoreKind, index: number) => (kind === ScoreKind.TX ? (index ? `TX${index}` : 'TX (mọi cột)') : kind);

export const DEFAULT_VISIBILITY = {
  regularMarks: true,
  examMarks: true,
  averages: true,
  termResults: true,
  titles: true,
  absences: true,
  homeroomComment: true,
  teacherNotes: true,
  onlyAfterLock: false,
};
export type Visibility = typeof DEFAULT_VISIBILITY;

/**
 * Gradebook control: column locks (khóa cột điểm), the entry window and edit
 * limit, the edit log (thống kê sửa điểm), entry monitoring (giám sát nhập
 * điểm), exemptions (miễn học) and what families see of grades.
 */
@Injectable()
export class GradeControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  // ---- column locks ----

  async locks(schoolId: string, semester: number, gradeLevel?: number) {
    const year = await this.years.current(schoolId);
    const rows = await this.prisma.gradeColumnLock.findMany({
      where: { schoolId, academicYearId: year.id, semester, ...(gradeLevel ? { gradeLevel } : {}) },
      select: { id: true, semester: true, gradeLevel: true, subjectId: true, kind: true, index: true, lockedAt: true, subject: { select: { name: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { kind: 'asc' }, { index: 'asc' }],
    });
    return rows.map((r) => ({ id: r.id, semester: r.semester, gradeLevel: r.gradeLevel, subjectId: r.subjectId, subjectName: r.subject?.name ?? null, kind: r.kind, index: r.index, column: columnLabel(r.kind, r.index), lockedAt: r.lockedAt }));
  }

  async lock(user: AuthUser, dto: ColumnLockDto) {
    const year = await this.years.current(user.schoolId);
    if (dto.subjectId) await this.subjectOf(user.schoolId, dto.subjectId);
    const index = dto.kind === ScoreKind.TX ? (dto.index ?? 0) : 0;
    const where = { schoolId: user.schoolId, academicYearId: year.id, semester: dto.semester, gradeLevel: dto.gradeLevel, subjectId: dto.subjectId ?? null, kind: dto.kind, index };
    const existing = await this.prisma.gradeColumnLock.findFirst({ where, select: { id: true } });
    if (!existing) await this.prisma.gradeColumnLock.create({ data: { ...where, lockedById: user.userId } });
    return this.locks(user.schoolId, dto.semester, dto.gradeLevel);
  }

  async unlock(schoolId: string, id: string) {
    const row = await this.prisma.gradeColumnLock.findFirst({ where: { id, schoolId }, select: { id: true } });
    if (!row) throw new NotFoundException('Không tìm thấy khóa cột điểm');
    await this.prisma.gradeColumnLock.delete({ where: { id } });
    return { ok: true };
  }

  /** The locks that apply to one gradebook (class grade level × subject × semester). */
  async locksFor(schoolId: string, academicYearId: string, semester: number, gradeLevel: number, subjectId: string): Promise<ColumnLockLike[]> {
    return this.prisma.gradeColumnLock.findMany({
      where: { schoolId, academicYearId, semester, gradeLevel, OR: [{ subjectId: null }, { subjectId }] },
      select: { gradeLevel: true, subjectId: true, kind: true, index: true },
    });
  }

  // ---- entry window ----

  async window(schoolId: string, academicYearId: string, semester: number) {
    const w = await this.prisma.gradeEntryWindow.findUnique({ where: { academicYearId_semester: { academicYearId, semester } }, select: { opensAt: true, closesAt: true, maxEdits: true } });
    return { semester, opensAt: w?.opensAt ?? null, closesAt: w?.closesAt ?? null, maxEdits: w?.maxEdits ?? null };
  }

  async windows(schoolId: string) {
    const year = await this.years.current(schoolId);
    return Promise.all([1, 2].map((s) => this.window(schoolId, year.id, s)));
  }

  async saveWindow(schoolId: string, dto: EntryWindowDto) {
    const year = await this.years.current(schoolId);
    const data = {
      ...(dto.opensAt !== undefined ? { opensAt: dto.opensAt ? new Date(dto.opensAt) : null } : {}),
      ...(dto.closesAt !== undefined ? { closesAt: dto.closesAt ? new Date(dto.closesAt) : null } : {}),
      ...(dto.maxEdits !== undefined ? { maxEdits: dto.maxEdits } : {}),
    };
    const current = await this.window(schoolId, year.id, dto.semester);
    const opensAt = data.opensAt !== undefined ? data.opensAt : current.opensAt;
    const closesAt = data.closesAt !== undefined ? data.closesAt : current.closesAt;
    if (opensAt && closesAt && opensAt >= closesAt) throw new BadRequestException('Thời điểm mở phải trước thời điểm đóng');
    await this.prisma.gradeEntryWindow.upsert({
      where: { academicYearId_semester: { academicYearId: year.id, semester: dto.semester } },
      create: { schoolId, academicYearId: year.id, semester: dto.semester, ...data },
      update: data,
    });
    return this.window(schoolId, year.id, dto.semester);
  }

  // ---- phân công giảng dạy ----

  /** Whether the school has recorded who teaches what in the semester; until it does, the timetable stands in. */
  async assignmentsRecorded(schoolId: string, academicYearId: string, semester: number) {
    return !!(await this.prisma.teachingAssignment.findFirst({ where: { schoolId, academicYearId, semester }, select: { id: true } }));
  }

  /**
   * Who teaches each class and subject in a semester: the teaching assignments once the
   * school has recorded them for the semester, else the timetable.
   */
  async taught(schoolId: string, academicYearId: string, semester: number, filter: { classId?: string; teacherId?: string; gradeLevel?: number } = {}) {
    const where = {
      schoolId,
      academicYearId,
      semester,
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
      ...(filter.gradeLevel ? { class: { gradeLevel: filter.gradeLevel } } : {}),
    };
    const select = {
      teacherId: true,
      classId: true,
      subjectId: true,
      teacher: { select: { fullName: true } },
      class: { select: { name: true, gradeLevel: true } },
      subject: { select: { id: true, code: true, name: true } },
    } as const;
    if (await this.assignmentsRecorded(schoolId, academicYearId, semester)) return this.prisma.teachingAssignment.findMany({ where, select });
    return this.prisma.timetableEntry.findMany({ where, distinct: ['teacherId', 'classId', 'subjectId'], select });
  }

  /** For the gradebook: who is assigned to the subject in the class, and whether the caller may write its marks. */
  async assignment(user: AuthUser, ctx: { academicYearId: string; semester: number; classId: string; subjectId: string }) {
    const recorded = await this.assignmentsRecorded(user.schoolId, ctx.academicYearId, ctx.semester);
    if (!recorded) return { recorded, teachers: [] as string[], mine: true };
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { classId: ctx.classId, subjectId: ctx.subjectId, semester: ctx.semester },
      select: { teacher: { select: { fullName: true, userId: true } } },
      orderBy: [{ createdAt: 'asc' }, { teacher: { fullName: 'asc' } }],
    });
    return { recorded, teachers: rows.map((r) => r.teacher.fullName), mine: user.role !== Role.TEACHER || rows.some((r) => r.teacher.userId === user.userId) };
  }

  /**
   * Checks a save against column locks (everyone), the teaching assignment, the entry
   * window and the edit limit (teachers only; the office may enter late marks). `before`
   * holds the current value of every touched cell.
   */
  async assertCanWrite(
    user: AuthUser,
    ctx: { academicYearId: string; semester: number; gradeLevel: number; subjectId: string; classId: string },
    changes: CellChange[],
    before: Map<string, { value: number | null; passed: boolean | null }>,
  ) {
    const locks = await this.locksFor(user.schoolId, ctx.academicYearId, ctx.semester, ctx.gradeLevel, ctx.subjectId);
    for (const c of changes) {
      if (locks.some((l) => lockCovers(l, ctx.gradeLevel, ctx.subjectId, c.kind, c.index))) throw new BadRequestException(`${COLUMN_LOCKED_MESSAGE}: ${columnLabel(c.kind, c.index)}`);
    }
    if (user.role !== Role.TEACHER) return;
    // Once the school records who teaches what, a teacher writes marks only where they are assigned.
    if (!(await this.assignment(user, ctx)).mine) throw new ForbiddenException(NOT_ASSIGNED_MESSAGE);
    const w = await this.window(user.schoolId, ctx.academicYearId, ctx.semester);
    const now = new Date();
    if ((w.opensAt && now < w.opensAt) || (w.closesAt && now > w.closesAt)) throw new ForbiddenException(WINDOW_CLOSED_MESSAGE);
    if (w.maxEdits === null) return;
    // Only changes to a mark that already had a value count as edits.
    const edits = changes.filter((c) => {
      const old = before.get(cellKey(c.studentId, c.kind, c.index));
      if (!old || (old.value === null && old.passed === null)) return false;
      return (c.value !== undefined && c.value !== old.value) || (c.passed !== undefined && c.passed !== old.passed);
    });
    if (!edits.length) return;
    const counts = await this.prisma.scoreEdit.groupBy({
      by: ['studentId', 'kind', 'index'],
      where: {
        academicYearId: ctx.academicYearId,
        semester: ctx.semester,
        subjectId: ctx.subjectId,
        studentId: { in: [...new Set(edits.map((e) => e.studentId))] },
        OR: [{ oldValue: { not: null } }, { oldPassed: { not: null } }],
      },
      _count: { _all: true },
    });
    const used = new Map(counts.map((c) => [cellKey(c.studentId, c.kind, c.index), c._count._all]));
    const over = edits.find((e) => (used.get(cellKey(e.studentId, e.kind, e.index)) ?? 0) >= (w.maxEdits as number));
    if (over) throw new ForbiddenException(`Điểm ${columnLabel(over.kind, over.index)} đã sửa đủ ${w.maxEdits} lần cho phép; liên hệ nhà trường để sửa tiếp`);
  }

  // ---- edit log ----

  async edits(schoolId: string, query: EditLogQuery) {
    const year = await this.years.current(schoolId);
    const rows = await this.prisma.scoreEdit.findMany({
      where: {
        schoolId,
        academicYearId: year.id,
        semester: query.semester,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.changesOnly ? { OR: [{ oldValue: { not: null } }, { oldPassed: { not: null } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const [students, subjects, classes, users] = await Promise.all([
      this.prisma.student.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } }, select: { id: true, code: true, fullName: true } }),
      this.prisma.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } }),
      this.prisma.class.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.classId))] } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.editedById))] } }, select: { id: true, fullName: true } }),
    ]);
    const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
    const [st, su, cl, us] = [by(students), by(subjects), by(classes), by(users)];
    const show = (v: Prisma.Decimal | null, p: boolean | null) => (v !== null ? formatMark(Number(v)) : (passedLabel(p) ?? ''));
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      class: cl.get(r.classId)?.name ?? '',
      subject: su.get(r.subjectId)?.name ?? '',
      studentCode: st.get(r.studentId)?.code ?? '',
      studentName: st.get(r.studentId)?.fullName ?? '',
      column: columnLabel(r.kind, r.index),
      oldValue: show(r.oldValue, r.oldPassed),
      newValue: show(r.newValue, r.newPassed),
      isChange: r.oldValue !== null || r.oldPassed !== null,
      editedBy: us.get(r.editedById)?.fullName ?? '',
      source: r.source,
    }));
  }

  // ---- monitoring ----

  /**
   * Giám sát nhập điểm: for each teacher × class × subject taught this semester
   * (from the teaching assignments, or the timetable before they are recorded),
   * how many of the expected marks are entered.
   */
  async monitor(schoolId: string, query: MonitorQuery) {
    const year = await this.years.current(schoolId);
    const entries = await this.taught(schoolId, year.id, query.semester, { teacherId: query.teacherId, gradeLevel: query.gradeLevel });
    if (!entries.length) return { semester: query.semester, rows: [], totals: { expected: 0, entered: 0, percent: 0 } };
    const classIds = [...new Set(entries.map((e) => e.classId))];
    const [settings, roster, scores, exemptions] = await Promise.all([
      loadSettings(this.prisma, schoolId),
      this.prisma.enrollment.findMany({ where: { classId: { in: classIds }, student: { status: StudentStatus.STUDYING } }, select: { classId: true, studentId: true } }),
      this.prisma.score.findMany({
        where: { classId: { in: classIds }, academicYearId: year.id, semester: query.semester, OR: [{ value: { not: null } }, { passed: { not: null } }] },
        select: { classId: true, subjectId: true, studentId: true, kind: true, index: true },
      }),
      this.prisma.subjectExemption.findMany({ where: { academicYearId: year.id, semester: { in: [query.semester, YEAR] } }, select: { studentId: true, subjectId: true } }),
    ]);
    const exempt = new Set(exemptions.map((e) => `${e.studentId}|${e.subjectId}`));
    const studentsOf = new Map<string, string[]>();
    for (const r of roster) studentsOf.set(r.classId, [...(studentsOf.get(r.classId) ?? []), r.studentId]);
    const rows = entries.map((e) => {
      const setting = settings.get(e.subjectId) ?? DEFAULT_SETTING;
      const students = (studentsOf.get(e.classId) ?? []).filter((s) => !exempt.has(`${s}|${e.subjectId}`));
      const enrolled = new Set(students);
      const perStudent = setting.regularCount + 2;
      const entered = scores.filter((s) => s.classId === e.classId && s.subjectId === e.subjectId && enrolled.has(s.studentId) && (s.kind !== ScoreKind.TX || s.index <= setting.regularCount)).length;
      const expected = students.length * perStudent;
      return {
        teacherId: e.teacherId,
        teacherName: e.teacher.fullName,
        classId: e.classId,
        className: e.class.name,
        gradeLevel: e.class.gradeLevel,
        subjectId: e.subjectId,
        subjectName: e.subject.name,
        students: students.length,
        expected,
        entered,
        percent: expected ? Math.round((entered / expected) * 1000) / 10 : 100,
      };
    });
    rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi') || a.className.localeCompare(b.className, 'vi', { numeric: true }) || a.subjectName.localeCompare(b.subjectName, 'vi'));
    const expected = rows.reduce((a, r) => a + r.expected, 0);
    const entered = rows.reduce((a, r) => a + r.entered, 0);
    return { semester: query.semester, rows, totals: { expected, entered, percent: expected ? Math.round((entered / expected) * 1000) / 10 : 100 } };
  }

  /** Danh sách học sinh thiếu điểm: per student and subject of a class, the columns still empty. */
  async missing(schoolId: string, query: MissingQuery) {
    const klass = await this.prisma.class.findFirst({ where: { id: query.classId, schoolId }, select: { id: true, name: true, academicYearId: true } });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    const [taught, settings, roster, scores, exemptions] = await Promise.all([
      this.taught(schoolId, klass.academicYearId, query.semester, { classId: klass.id }),
      loadSettings(this.prisma, schoolId),
      this.prisma.enrollment.findMany({ where: { classId: klass.id, student: { status: StudentStatus.STUDYING } }, select: { student: { select: { id: true, code: true, fullName: true } } }, orderBy: { student: { fullName: 'asc' } } }),
      this.prisma.score.findMany({
        where: { classId: klass.id, academicYearId: klass.academicYearId, semester: query.semester, OR: [{ value: { not: null } }, { passed: { not: null } }] },
        select: { subjectId: true, studentId: true, kind: true, index: true },
      }),
      this.prisma.subjectExemption.findMany({ where: { academicYearId: klass.academicYearId, semester: { in: [query.semester, YEAR] } }, select: { studentId: true, subjectId: true } }),
    ]);
    const has = new Set(scores.map((s) => `${s.studentId}|${s.subjectId}|${s.kind}|${s.index}`));
    const exempt = new Set(exemptions.map((e) => `${e.studentId}|${e.subjectId}`));
    // A subject two teachers share (the parts of Khoa học tự nhiên) lists both.
    const bySubject = new Map<string, { id: string; code: string; name: string; teacher: string }>();
    for (const t of taught) {
      const s = bySubject.get(t.subjectId);
      bySubject.set(t.subjectId, s ? { ...s, teacher: `${s.teacher}, ${t.teacher.fullName}` } : { ...t.subject, teacher: t.teacher.fullName });
    }
    const subjects = orderSubjects([...bySubject.values()]);
    const rows: { studentId: string; code: string; fullName: string; subject: string; teacher: string; missing: string[] }[] = [];
    for (const { student } of roster) {
      for (const subject of subjects) {
        if (exempt.has(`${student.id}|${subject.id}`)) continue;
        const setting = settings.get(subject.id) ?? DEFAULT_SETTING;
        const columns: [ScoreKind, number][] = [...Array.from({ length: setting.regularCount }, (_, i) => [ScoreKind.TX, i + 1] as [ScoreKind, number]), [ScoreKind.GK, 1], [ScoreKind.CK, 1]];
        const missing = columns.filter(([k, i]) => !has.has(`${student.id}|${subject.id}|${k}|${i}`)).map(([k, i]) => (k === ScoreKind.TX ? `TX${i}` : k));
        if (missing.length) rows.push({ studentId: student.id, code: student.code, fullName: student.fullName, subject: subject.name, teacher: subject.teacher, missing });
      }
    }
    return { class: { id: klass.id, name: klass.name }, semester: query.semester, rows };
  }

  // ---- exemptions ----

  async exemptions(schoolId: string, query: ExemptionQuery) {
    const year = await this.years.current(schoolId);
    const rows = await this.prisma.subjectExemption.findMany({
      where: {
        schoolId,
        academicYearId: year.id,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.classId ? { student: { enrollments: { some: { classId: query.classId } } } } : {}),
      },
      select: { id: true, semester: true, reason: true, createdAt: true, student: { select: { id: true, code: true, fullName: true } }, subject: { select: { id: true, name: true } } },
      orderBy: [{ student: { fullName: 'asc' } }, { createdAt: 'asc' }],
    });
    return rows;
  }

  async addExemption(user: AuthUser, dto: ExemptionDto) {
    const year = await this.years.current(user.schoolId);
    const enrollment = await this.prisma.enrollment.findFirst({ where: { studentId: dto.studentId, academicYearId: year.id, student: { schoolId: user.schoolId } }, select: { classId: true } });
    if (!enrollment) throw new NotFoundException('Không tìm thấy học sinh trong năm học hiện tại');
    await this.subjectOf(user.schoolId, dto.subjectId);
    const row = await this.prisma.subjectExemption.upsert({
      where: { studentId_subjectId_academicYearId_semester: { studentId: dto.studentId, subjectId: dto.subjectId, academicYearId: year.id, semester: dto.semester } },
      create: { schoolId: user.schoolId, academicYearId: year.id, semester: dto.semester, studentId: dto.studentId, subjectId: dto.subjectId, reason: dto.reason ?? null, createdById: user.userId },
      update: { reason: dto.reason ?? null },
    });
    await recomputeResults(this.prisma, { schoolId: user.schoolId, academicYearId: year.id, classId: enrollment.classId, studentIds: [dto.studentId] });
    return row;
  }

  async removeExemption(schoolId: string, id: string) {
    const row = await this.prisma.subjectExemption.findFirst({ where: { id, schoolId }, select: { id: true, studentId: true, academicYearId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy miễn học');
    await this.prisma.subjectExemption.delete({ where: { id } });
    const enrollment = await this.prisma.enrollment.findFirst({ where: { studentId: row.studentId, academicYearId: row.academicYearId }, select: { classId: true } });
    if (enrollment) await recomputeResults(this.prisma, { schoolId, academicYearId: row.academicYearId, classId: enrollment.classId, studentIds: [row.studentId] });
    return { ok: true };
  }

  // ---- visibility ----

  async visibility(schoolId: string): Promise<Visibility> {
    const row = await this.prisma.gradeVisibility.findUnique({ where: { schoolId } });
    if (!row) return { ...DEFAULT_VISIBILITY };
    const { schoolId: _s, updatedAt: _u, ...rest } = row;
    return rest;
  }

  async saveVisibility(schoolId: string, dto: VisibilityDto): Promise<Visibility> {
    await this.prisma.gradeVisibility.upsert({ where: { schoolId }, create: { schoolId, ...dto }, update: dto });
    return this.visibility(schoolId);
  }

  private async subjectOf(schoolId: string, subjectId: string) {
    const s = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } });
    if (!s) throw new NotFoundException('Không tìm thấy môn học');
    return s;
  }
}

export const cellKey = (studentId: string, kind: ScoreKind, index: number) => `${studentId}|${kind}|${index}`;

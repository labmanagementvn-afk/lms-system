import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DutyKind, Prisma, TeacherStatus } from '@prisma/client';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';
import { DutyQuery, DutyTypeDto, SemesterQuery, TeacherDutyDto, UpdateDutyTypeDto, UpdateTeacherDutyDto, WorkloadSettingDto } from './teaching.dto';
import { defaultDuties, HOMEROOM_REDUCTION, LEVEL_LABEL, levelOf, round1, SchoolLevel, TEACHER_NORM, workload } from './workload';

const KIND_ORDER: Record<DutyKind, number> = { POSITION: 0, CONCURRENT: 1, OTHER: 2 };

const dutyInclude = {
  teacher: { select: { id: true, code: true, fullName: true, subjectGroup: true } },
  dutyType: { select: { id: true, code: true, name: true, kind: true, periods: true } },
} satisfies Prisma.TeacherDutyInclude;

type DutyRow = Prisma.TeacherDutyGetPayload<{ include: typeof dutyInclude }>;

const formatDuty = (d: DutyRow) => ({
  id: d.id,
  teacher: d.teacher,
  dutyType: { ...d.dutyType, periods: Number(d.dutyType.periods) },
  semester: d.semester,
  periods: d.periods === null ? null : Number(d.periods),
  /** What the duty counts for this teacher: their own number, or the catalogue's. */
  effectivePeriods: Number(d.periods ?? d.dutyType.periods),
  note: d.note,
});

/** "Tổ Toán": who leads first (positions by norm), then by group, then by code. */
const teacherOrder = (a: { norm: number; position: string | null; teacher: { subjectGroup: string | null; code: string } }, b: typeof a) =>
  (a.position ? 0 : 1) - (b.position ? 0 : 1) ||
  (a.position && b.position ? a.norm - b.norm : 0) ||
  (a.teacher.subjectGroup ?? '￿').localeCompare(b.teacher.subjectGroup ?? '￿', 'vi') ||
  a.teacher.code.localeCompare(b.teacher.code, 'vi', { numeric: true });

/**
 * Chức vụ, kiêm nhiệm and định mức tiết dạy (Thông tư 05/2025/TT-BGDĐT): the school's
 * catalogue, who holds what, and each teacher's load against their norm.
 */
@Injectable()
export class DutiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  /** The school's level, from the classes of its current year. */
  async level(schoolId: string): Promise<SchoolLevel> {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], select: { id: true } });
    const grades = year ? await this.prisma.class.findMany({ where: { schoolId, academicYearId: year.id }, select: { gradeLevel: true }, distinct: ['gradeLevel'] }) : [];
    return levelOf(grades.map((g) => g.gradeLevel));
  }

  // ---- danh mục ----

  /** The catalogue; a school that has none yet gets the circular's. */
  async types(schoolId: string) {
    if (!(await this.prisma.dutyType.findFirst({ where: { schoolId }, select: { id: true } }))) {
      const level = await this.level(schoolId);
      await this.prisma.dutyType.createMany({ data: defaultDuties(level).map((d, i) => ({ ...d, schoolId, sortOrder: (i + 1) * 10 })), skipDuplicates: true });
    }
    const rows = await this.prisma.dutyType.findMany({ where: { schoolId }, include: { _count: { select: { duties: true } } } });
    rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'));
    return rows.map(({ _count, ...t }) => ({ ...t, periods: Number(t.periods), used: _count.duties }));
  }

  async createType(schoolId: string, dto: DutyTypeDto) {
    await this.types(schoolId);
    const last = await this.prisma.dutyType.findFirst({ where: { schoolId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    try {
      const row = await this.prisma.dutyType.create({ data: { ...dto, code: dto.code.toUpperCase(), schoolId, sortOrder: (last?.sortOrder ?? 0) + 10 } });
      return { ...row, periods: Number(row.periods), used: 0 };
    } catch (e) {
      rethrowPrismaError(e, 'Mã đã có trong danh mục');
    }
  }

  async updateType(schoolId: string, id: string, dto: UpdateDutyTypeDto) {
    const existing = await this.prisma.dutyType.findFirst({ where: { id, schoolId }, include: { _count: { select: { duties: true } } } });
    if (!existing) throw new NotFoundException('Không tìm thấy chức vụ, kiêm nhiệm');
    // Moving a duty held by teachers between a norm and a reduction would silently change their loads.
    if (dto.kind && dto.kind !== existing.kind && existing._count.duties) throw new BadRequestException('Đã có giáo viên được phân công: không đổi loại, hãy thêm mục mới');
    try {
      const row = await this.prisma.dutyType.update({ where: { id }, data: { ...dto, code: dto.code?.toUpperCase() } });
      return { ...row, periods: Number(row.periods), used: existing._count.duties };
    } catch (e) {
      rethrowPrismaError(e, 'Mã đã có trong danh mục');
    }
  }

  async removeType(schoolId: string, id: string) {
    const existing = await this.prisma.dutyType.findFirst({ where: { id, schoolId }, include: { _count: { select: { duties: true } } } });
    if (!existing) throw new NotFoundException('Không tìm thấy chức vụ, kiêm nhiệm');
    if (existing._count.duties) throw new BadRequestException('Đã có giáo viên được phân công: hãy ngừng sử dụng thay vì xóa');
    await this.prisma.dutyType.delete({ where: { id } });
  }

  // ---- phân công kiêm nhiệm ----

  async duties(schoolId: string, query: DutyQuery) {
    const year = await this.assignments.yearOf(schoolId, query.academicYearId);
    const rows = await this.prisma.teacherDuty.findMany({ where: { schoolId, academicYearId: year.id, teacherId: query.teacherId }, include: dutyInclude });
    rows.sort((a, b) => KIND_ORDER[a.dutyType.kind] - KIND_ORDER[b.dutyType.kind] || a.teacher.fullName.localeCompare(b.teacher.fullName, 'vi') || (a.semester ?? 0) - (b.semester ?? 0));
    return { academicYear: { id: year.id, name: year.name }, items: rows.map(formatDuty) };
  }

  async addDuty(schoolId: string, dto: TeacherDutyDto, academicYearId?: string) {
    const year = await this.assignments.yearOf(schoolId, academicYearId);
    const [teacher, type] = await Promise.all([
      this.prisma.teacher.findFirst({ where: { id: dto.teacherId, schoolId }, select: { id: true, fullName: true, status: true } }),
      this.prisma.dutyType.findFirst({ where: { id: dto.dutyTypeId, schoolId }, select: { id: true, name: true, active: true } }),
    ]);
    if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');
    if (teacher.status !== TeacherStatus.ACTIVE) throw new BadRequestException(`${teacher.fullName} không còn công tác`);
    if (!type) throw new BadRequestException('Chức vụ, kiêm nhiệm không hợp lệ');
    if (!type.active) throw new BadRequestException(`${type.name} đã ngừng sử dụng`);
    await this.assertNoOverlap(year.id, teacher.id, type.id, dto.semester ?? null);
    const row = await this.prisma.teacherDuty.create({
      data: { schoolId, academicYearId: year.id, teacherId: teacher.id, dutyTypeId: type.id, semester: dto.semester ?? null, periods: dto.periods ?? null, note: dto.note?.trim() || null },
      include: dutyInclude,
    });
    return formatDuty(row);
  }

  async updateDuty(schoolId: string, id: string, dto: UpdateTeacherDutyDto) {
    const existing = await this.prisma.teacherDuty.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm');
    if (dto.teacherId && dto.teacherId !== existing.teacherId) throw new BadRequestException('Không đổi giáo viên của một phân công; hãy xóa và thêm mới');
    let dutyTypeId = existing.dutyTypeId;
    if (dto.dutyTypeId && dto.dutyTypeId !== existing.dutyTypeId) {
      const type = await this.prisma.dutyType.findFirst({ where: { id: dto.dutyTypeId, schoolId, active: true }, select: { id: true } });
      if (!type) throw new BadRequestException('Chức vụ, kiêm nhiệm không hợp lệ');
      dutyTypeId = type.id;
    }
    const semester = dto.semester === undefined ? existing.semester : dto.semester;
    await this.assertNoOverlap(existing.academicYearId, existing.teacherId, dutyTypeId, semester, id);
    const row = await this.prisma.teacherDuty.update({
      where: { id },
      data: {
        dutyTypeId,
        semester,
        periods: dto.periods === undefined ? undefined : dto.periods,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
      include: dutyInclude,
    });
    return formatDuty(row);
  }

  async removeDuty(schoolId: string, id: string) {
    const existing = await this.prisma.teacherDuty.findFirst({ where: { id, schoolId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Không tìm thấy phân công kiêm nhiệm');
    await this.prisma.teacherDuty.delete({ where: { id } });
  }

  /** The same duty twice in an overlapping period (the whole year and one semester overlap). */
  private async assertNoOverlap(academicYearId: string, teacherId: string, dutyTypeId: string, semester: number | null, exceptId?: string) {
    const clash = await this.prisma.teacherDuty.findFirst({
      where: { academicYearId, teacherId, dutyTypeId, id: exceptId ? { not: exceptId } : undefined, ...(semester ? { OR: [{ semester: null }, { semester }] } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Giáo viên đã được phân công nhiệm vụ này trong thời gian đó');
  }

  // ---- định mức ----

  /** The school's norms: its own when set, else the circular's for its level. */
  async settings(schoolId: string) {
    const [level, row] = await Promise.all([this.level(schoolId), this.prisma.workloadSetting.findUnique({ where: { schoolId } })]);
    const defaults = { teacherNorm: TEACHER_NORM[level], homeroomReduction: HOMEROOM_REDUCTION };
    return {
      level,
      levelName: LEVEL_LABEL[level],
      teacherNorm: row ? Number(row.teacherNorm) : defaults.teacherNorm,
      homeroomReduction: row ? Number(row.homeroomReduction) : defaults.homeroomReduction,
      defaults,
      custom: !!row,
    };
  }

  async saveSettings(schoolId: string, dto: WorkloadSettingDto) {
    await this.prisma.workloadSetting.upsert({ where: { schoolId }, create: { schoolId, ...dto }, update: dto });
    return this.settings(schoolId);
  }

  async resetSettings(schoolId: string) {
    await this.prisma.workloadSetting.deleteMany({ where: { schoolId } });
    return this.settings(schoolId);
  }

  /**
   * Each teacher's semester: the norm, what is taken off it (homeroom class, duties), the
   * periods assigned and the difference, with the limits of Điều 3 checked.
   */
  async workload(schoolId: string, query: SemesterQuery) {
    const year = await this.assignments.yearOf(schoolId, query.academicYearId);
    const [setting, teachers, classes, duties, assigned] = await Promise.all([
      this.settings(schoolId),
      this.prisma.teacher.findMany({
        where: {
          schoolId,
          OR: [{ status: TeacherStatus.ACTIVE }, { assignments: { some: { academicYearId: year.id } } }, { duties: { some: { academicYearId: year.id } } }],
        },
        select: { id: true, code: true, fullName: true, subjectGroup: true, status: true },
      }),
      this.prisma.class.findMany({ where: { schoolId, academicYearId: year.id, homeroomTeacherId: { not: null } }, select: { name: true, gradeLevel: true, homeroomTeacherId: true } }),
      // In the catalogue's order, so a teacher's reductions read the same way everywhere.
      this.prisma.teacherDuty.findMany({ where: { schoolId, academicYearId: year.id, OR: [{ semester: null }, { semester: query.semester }] }, include: dutyInclude, orderBy: [{ dutyType: { sortOrder: 'asc' } }, { createdAt: 'asc' }] }),
      this.prisma.teachingAssignment.findMany({ where: { schoolId, academicYearId: year.id, semester: query.semester }, include: { class: { select: { name: true, gradeLevel: true } }, subject: { select: { name: true } } } }),
    ]);
    classes.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true }));

    const rows = teachers.map((t) => {
      const mine = assigned.filter((a) => a.teacherId === t.id).sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'vi') || a.class.gradeLevel - b.class.gradeLevel || a.class.name.localeCompare(b.class.name, 'vi', { numeric: true }));
      const held = duties.filter((d) => d.teacherId === t.id).map(formatDuty);
      const homeroomClasses = classes.filter((c) => c.homeroomTeacherId === t.id).map((c) => c.name);
      const w = workload({
        teacherNorm: setting.teacherNorm,
        homeroomReduction: setting.homeroomReduction,
        homeroomClasses,
        duties: held.map((d) => ({ name: d.note ? `${d.dutyType.name} (${d.note})` : d.dutyType.name, kind: d.dutyType.kind, periods: d.effectivePeriods })),
        assigned: mine.reduce((a, x) => a + Number(x.periodsPerWeek), 0),
      });
      // "Toán: 6A1, 6A2 (8 tiết)" per subject.
      const subjects = new Map<string, { subject: string; classes: string[]; periods: number }>();
      for (const a of mine) {
        const s = subjects.get(a.subject.name) ?? { subject: a.subject.name, classes: [], periods: 0 };
        s.classes.push(a.class.name);
        s.periods = round1(s.periods + Number(a.periodsPerWeek));
        subjects.set(a.subject.name, s);
      }
      return { teacher: { id: t.id, code: t.code, fullName: t.fullName, subjectGroup: t.subjectGroup, active: t.status === TeacherStatus.ACTIVE }, homeroomClasses, duties: held, teaching: [...subjects.values()], ...w };
    });
    rows.sort(teacherOrder);
    const sum = (f: (r: (typeof rows)[number]) => number) => round1(rows.reduce((a, r) => a + f(r), 0));
    return {
      academicYear: { id: year.id, name: year.name },
      semester: query.semester,
      setting,
      rows,
      totals: {
        teachers: rows.length,
        assigned: sum((r) => r.assigned),
        required: sum((r) => r.required),
        over: rows.filter((r) => r.difference > 0).length,
        short: rows.filter((r) => r.difference < 0).length,
        warnings: rows.filter((r) => r.warnings.length).length,
      },
    };
  }
}

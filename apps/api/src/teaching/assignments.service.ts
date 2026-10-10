import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DutyKind, Prisma, StudentStatus, TeacherStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentCellDto, AssignmentQuery, CopyAssignmentsDto, FromTimetableDto, SaveHomeroomDto } from './teaching.dto';
import { MAX_CONCURRENT, weeklyFromYearly } from './workload';

const include = {
  class: { select: { id: true, name: true, gradeLevel: true } },
  subject: { select: { id: true, code: true, name: true } },
  teacher: { select: { id: true, code: true, fullName: true } },
} satisfies Prisma.TeachingAssignmentInclude;

type Row = Prisma.TeachingAssignmentGetPayload<{ include: typeof include }>;

const format = (a: Row) => ({
  id: a.id,
  semester: a.semester,
  class: a.class,
  subject: a.subject,
  teacher: a.teacher,
  periodsPerWeek: Number(a.periodsPerWeek),
});

export const byClassName = (a: { gradeLevel: number; name: string }, b: { gradeLevel: number; name: string }) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true });

/**
 * Phân công giảng dạy and phân công chủ nhiệm: who teaches what in each class each
 * semester, and who is homeroom teacher of each class.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  async yearOf(schoolId: string, academicYearId?: string) {
    if (!academicYearId) return this.years.current(schoolId);
    const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new NotFoundException('Không tìm thấy năm học');
    return year;
  }

  /** The semester's assignments, with what the timetable already holds and the periods suggested by each subject's yearly total. */
  async list(schoolId: string, query: AssignmentQuery) {
    const year = await this.yearOf(schoolId, query.academicYearId);
    const where = { schoolId, academicYearId: year.id, semester: query.semester, classId: query.classId, teacherId: query.teacherId };
    const [items, timetable, settings] = await Promise.all([
      this.prisma.teachingAssignment.findMany({ where, include }),
      this.prisma.timetableEntry.groupBy({ by: ['classId', 'subjectId', 'teacherId'], where, _count: { _all: true } }),
      this.prisma.subjectSetting.findMany({ where: { schoolId, periodsPerYear: { not: null } }, select: { subjectId: true, periodsPerYear: true } }),
    ]);
    items.sort((a, b) => byClassName(a.class, b.class) || a.subject.name.localeCompare(b.subject.name, 'vi') || a.teacher.fullName.localeCompare(b.teacher.fullName, 'vi'));
    return {
      academicYear: { id: year.id, name: year.name },
      semester: query.semester,
      items: items.map(format),
      timetable: timetable.map((t) => ({ classId: t.classId, subjectId: t.subjectId, teacherId: t.teacherId, periods: t._count._all })),
      suggested: Object.fromEntries(settings.map((s) => [s.subjectId, weeklyFromYearly(s.periodsPerYear as number)])),
    };
  }

  /** Sets who teaches one subject in one class in a semester; teachers left out lose it. */
  async setCell(schoolId: string, dto: AssignmentCellDto) {
    const [klass, subject] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId }, select: { id: true, academicYearId: true } }),
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId }, select: { id: true } }),
    ]);
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    if (!subject) throw new BadRequestException('Môn học không hợp lệ');
    const ids = dto.teachers.map((t) => t.teacherId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Một giáo viên chỉ ghi một lần cho mỗi môn của lớp');
    if (ids.length) {
      const teachers = await this.prisma.teacher.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, fullName: true, status: true } });
      if (teachers.length !== ids.length) throw new BadRequestException('Giáo viên không hợp lệ');
      const away = teachers.find((t) => t.status !== TeacherStatus.ACTIVE);
      if (away) throw new BadRequestException(`${away.fullName} không còn công tác`);
    }
    const cell = { classId: klass.id, subjectId: subject.id, semester: dto.semester };
    await this.prisma.$transaction([
      this.prisma.teachingAssignment.deleteMany({ where: { ...cell, teacherId: { notIn: ids } } }),
      ...dto.teachers.map((t) =>
        this.prisma.teachingAssignment.upsert({
          where: { classId_subjectId_semester_teacherId: { ...cell, teacherId: t.teacherId } },
          create: { ...cell, schoolId, academicYearId: klass.academicYearId, teacherId: t.teacherId, periodsPerWeek: t.periodsPerWeek },
          update: { periodsPerWeek: t.periodsPerWeek },
        }),
      ),
    ]);
    const rows = await this.prisma.teachingAssignment.findMany({ where: cell, include, orderBy: { createdAt: 'asc' } });
    return rows.map(format);
  }

  /** Makes the semester's assignments from the timetable, for the subjects of each class that have none yet. */
  async fromTimetable(schoolId: string, dto: FromTimetableDto) {
    const year = await this.years.current(schoolId);
    const where = { schoolId, academicYearId: year.id, semester: dto.semester };
    const [groups, existing] = await Promise.all([
      this.prisma.timetableEntry.groupBy({ by: ['classId', 'subjectId', 'teacherId'], where, _count: { _all: true } }),
      this.prisma.teachingAssignment.findMany({ where, select: { classId: true, subjectId: true } }),
    ]);
    const taken = new Set(existing.map((e) => `${e.classId}|${e.subjectId}`));
    const data = groups
      .filter((g) => !taken.has(`${g.classId}|${g.subjectId}`))
      .map((g) => ({ ...where, classId: g.classId, subjectId: g.subjectId, teacherId: g.teacherId, periodsPerWeek: g._count._all }));
    const { count } = await this.prisma.teachingAssignment.createMany({ data, skipDuplicates: true });
    return { created: count };
  }

  /** Copies one semester's assignments to the other, for the subjects of each class that have none there yet. */
  async copy(schoolId: string, dto: CopyAssignmentsDto) {
    if (dto.from === dto.to) throw new BadRequestException('Chọn hai học kỳ khác nhau');
    const year = await this.years.current(schoolId);
    const [source, target] = await Promise.all([
      this.prisma.teachingAssignment.findMany({ where: { schoolId, academicYearId: year.id, semester: dto.from }, select: { classId: true, subjectId: true, teacherId: true, periodsPerWeek: true } }),
      this.prisma.teachingAssignment.findMany({ where: { schoolId, academicYearId: year.id, semester: dto.to }, select: { classId: true, subjectId: true } }),
    ]);
    const taken = new Set(target.map((e) => `${e.classId}|${e.subjectId}`));
    const data = source.filter((s) => !taken.has(`${s.classId}|${s.subjectId}`)).map((s) => ({ ...s, schoolId, academicYearId: year.id, semester: dto.to }));
    const { count } = await this.prisma.teachingAssignment.createMany({ data, skipDuplicates: true });
    return { created: count };
  }

  // ---- phân công chủ nhiệm ----

  /** Each class of the year with its homeroom teacher, and each teacher with the classes and concurrent duties they hold. */
  async homeroom(schoolId: string, academicYearId?: string) {
    const year = await this.yearOf(schoolId, academicYearId);
    const [classes, teachers, duties] = await Promise.all([
      this.prisma.class.findMany({
        where: { schoolId, academicYearId: year.id },
        select: {
          id: true,
          name: true,
          gradeLevel: true,
          room: true,
          homeroomTeacher: { select: { id: true, code: true, fullName: true } },
          _count: { select: { enrollments: { where: { student: { status: StudentStatus.STUDYING } } } } },
        },
      }),
      this.prisma.teacher.findMany({ where: { schoolId, status: TeacherStatus.ACTIVE }, select: { id: true, code: true, fullName: true, subjectGroup: true }, orderBy: { code: 'asc' } }),
      this.prisma.teacherDuty.findMany({
        where: { schoolId, academicYearId: year.id, dutyType: { kind: DutyKind.CONCURRENT } },
        select: { teacherId: true, semester: true, dutyType: { select: { name: true } } },
        orderBy: [{ dutyType: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
      }),
    ]);
    classes.sort(byClassName);
    return {
      academicYear: { id: year.id, name: year.name },
      maxConcurrent: MAX_CONCURRENT,
      classes: classes.map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel, room: c.room, students: c._count.enrollments, homeroomTeacher: c.homeroomTeacher })),
      teachers: teachers.map((t) => ({
        ...t,
        homeroomClasses: classes.filter((c) => c.homeroomTeacher?.id === t.id).map((c) => c.name),
        duties: duties.filter((d) => d.teacherId === t.id).map((d) => (d.semester ? `${d.dutyType.name} (HK${d.semester === 1 ? 'I' : 'II'})` : d.dutyType.name)),
      })),
    };
  }

  /** Sets the homeroom teacher of the given classes of the year (null leaves a class without one). */
  async saveHomeroom(schoolId: string, dto: SaveHomeroomDto, academicYearId?: string) {
    const year = await this.yearOf(schoolId, academicYearId);
    const classIds = dto.items.map((i) => i.classId);
    if (new Set(classIds).size !== classIds.length) throw new BadRequestException('Mỗi lớp chỉ ghi một lần');
    const classes = await this.prisma.class.count({ where: { schoolId, academicYearId: year.id, id: { in: classIds } } });
    if (classes !== classIds.length) throw new BadRequestException('Lớp không thuộc năm học này');
    const teacherIds = [...new Set(dto.items.map((i) => i.teacherId).filter((t): t is string => !!t))];
    if (teacherIds.length) {
      const teachers = await this.prisma.teacher.findMany({ where: { schoolId, id: { in: teacherIds } }, select: { fullName: true, status: true } });
      if (teachers.length !== teacherIds.length) throw new BadRequestException('Giáo viên không hợp lệ');
      const away = teachers.find((t) => t.status !== TeacherStatus.ACTIVE);
      if (away) throw new BadRequestException(`${away.fullName} không còn công tác`);
    }
    await this.prisma.$transaction(dto.items.map((i) => this.prisma.class.update({ where: { id: i.classId }, data: { homeroomTeacherId: i.teacherId ?? null } })));
    return this.homeroom(schoolId, year.id);
  }
}

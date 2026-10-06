import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CourseStatus, LessonType, NotificationKind, Prisma, StudentStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { flattenLessons, lessonValidationError, LessonFields, LessonRefs } from './lessons';
import { lessonInclude, LmsAccessService, studentRef, studentSelect, subjectSelect, teacherSelect } from './lms-access.service';
import { CourseQuery, CreateCourseDto, CreateLessonDto, EnrolStudentsDto, ReorderDto, SectionDto, UpdateCourseDto, UpdateLessonDto } from './lms.dto';

const courseInclude = {
  teacher: { select: teacherSelect },
  subject: { select: subjectSelect },
  academicYear: { select: { id: true, name: true } },
  cover: { select: { id: true, name: true, mimeType: true } },
  _count: { select: { lessons: true, enrollments: true } },
} satisfies Prisma.CourseInclude;

type CourseRow = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

const summary = ({ _count, ...c }: CourseRow) => ({ ...c, lessonCount: _count.lessons, enrollmentCount: _count.enrollments });

/** Courses, their sections and lessons, and who is enrolled. */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LmsAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- courses ----

  async list(user: AuthUser, query: CourseQuery): Promise<Page<unknown>> {
    let teacherId = query.teacherId;
    if (query.mine) {
      teacherId = (await this.access.teacherOf(user)) ?? '';
      if (!teacherId) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const where: Prisma.CourseWhereInput = {
      schoolId: user.schoolId,
      status: query.status,
      subjectId: query.subjectId,
      gradeLevel: query.gradeLevel,
      teacherId,
      title: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, include: courseInclude, orderBy: [{ updatedAt: 'desc' }], ...pageArgs(query) }),
      this.prisma.course.count({ where }),
    ]);
    return { items: rows.map(summary), total, page: query.page, pageSize: query.pageSize };
  }

  async create(user: AuthUser, dto: CreateCourseDto) {
    const schoolId = user.schoolId;
    const teacherId = await this.access.resolveTeacherId(user, dto.teacherId);
    const academicYearId = dto.academicYearId ?? (await this.access.currentYearId(schoolId));
    await this.assertRefs(schoolId, dto, academicYearId);
    const course = await this.prisma.course.create({
      data: {
        schoolId,
        teacherId,
        academicYearId,
        title: dto.title.trim(),
        description: dto.description,
        subjectId: dto.subjectId,
        gradeLevel: dto.gradeLevel,
        classIds: dto.classIds ?? [],
        coverFileId: dto.coverFileId,
      },
    });
    return this.get(schoolId, course.id);
  }

  /** The course with its sections and lessons in reading order. */
  async get(schoolId: string, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, schoolId },
      include: {
        ...courseInclude,
        sections: { orderBy: { sortOrder: 'asc' } },
        lessons: { include: lessonInclude, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    const { sections, lessons, ...rest } = course;
    return {
      ...summary(rest as CourseRow),
      sections: sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.sectionId === s.id) })),
      unsectioned: lessons.filter((l) => !l.sectionId),
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateCourseDto) {
    const schoolId = user.schoolId;
    const course = await this.access.course(schoolId, id);
    const academicYearId = dto.academicYearId ?? course.academicYearId;
    await this.assertRefs(schoolId, dto, dto.academicYearId ? academicYearId : null);
    // Office staff may hand the course to another teacher; teachers keep their own.
    const teacherId = dto.teacherId && dto.teacherId !== course.teacherId ? await this.access.resolveTeacherId(user, dto.teacherId) : undefined;
    await this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        subjectId: dto.subjectId,
        gradeLevel: dto.gradeLevel,
        academicYearId: dto.academicYearId,
        classIds: dto.classIds,
        coverFileId: dto.coverFileId,
        teacherId,
      },
    });
    return this.get(schoolId, id);
  }

  async remove(schoolId: string, id: string) {
    const course = await this.access.course(schoolId, id);
    if (course.status !== CourseStatus.DRAFT) throw new BadRequestException('Chỉ xóa được khóa học ở trạng thái nháp');
    await this.prisma.course.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Opens the course: every studying student of the audience classes (or of the
   * whole school when no class is set) is enrolled and told about it. Running it
   * again only picks up students enrolled since.
   */
  async publish(schoolId: string, id: string) {
    const course = await this.access.course(schoolId, id);
    const yearId = course.academicYearId ?? (await this.access.currentYearId(schoolId));
    const where: Prisma.StudentWhereInput = { schoolId, status: StudentStatus.STUDYING };
    if (course.classIds.length) where.enrollments = { some: { classId: { in: course.classIds }, academicYearId: yearId ?? undefined } };
    const [students, existing] = await Promise.all([
      this.prisma.student.findMany({ where, select: { id: true, userId: true } }),
      this.prisma.courseEnrollment.findMany({ where: { courseId: id }, select: { studentId: true } }),
    ]);
    const enrolled = new Set(existing.map((e) => e.studentId));
    const fresh = students.filter((s) => !enrolled.has(s.id));
    await this.prisma.$transaction([
      this.prisma.course.update({ where: { id }, data: { status: CourseStatus.PUBLISHED } }),
      this.prisma.courseEnrollment.createMany({ data: fresh.map((s) => ({ courseId: id, studentId: s.id })), skipDuplicates: true }),
    ]);
    try {
      await this.notifications.notifyUsers(
        schoolId,
        fresh.map((s) => s.userId).filter((u): u is string => !!u),
        { kind: NotificationKind.COURSE_PUBLISHED, title: 'Khóa học mới', body: `${course.title} đã mở, vào học ngay nhé`, data: { courseId: id } },
      );
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo mở khóa học ${id}: ${e}`);
    }
    return { ...(await this.get(schoolId, id)), enrolled: fresh.length };
  }

  async archive(schoolId: string, id: string) {
    await this.access.course(schoolId, id);
    await this.prisma.course.update({ where: { id }, data: { status: CourseStatus.ARCHIVED } });
    return this.get(schoolId, id);
  }

  // ---- sections ----

  async addSection(schoolId: string, courseId: string, dto: SectionDto) {
    await this.access.course(schoolId, courseId);
    const last = await this.prisma.courseSection.aggregate({ where: { courseId }, _max: { sortOrder: true } });
    return this.prisma.courseSection.create({ data: { courseId, title: dto.title.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  }

  async updateSection(schoolId: string, id: string, dto: SectionDto) {
    await this.section(schoolId, id);
    return this.prisma.courseSection.update({ where: { id }, data: { title: dto.title.trim() } });
  }

  /** Deletes the section; its lessons stay in the course without a section. */
  async removeSection(schoolId: string, id: string) {
    await this.section(schoolId, id);
    await this.prisma.courseSection.delete({ where: { id } });
    return { ok: true };
  }

  // ---- lessons ----

  async addLesson(schoolId: string, courseId: string, dto: CreateLessonDto) {
    await this.access.course(schoolId, courseId);
    if (dto.sectionId) {
      const s = await this.prisma.courseSection.findFirst({ where: { id: dto.sectionId, courseId } });
      if (!s) throw new BadRequestException('Mục không thuộc khóa học này');
    }
    await this.validateLesson(schoolId, dto.type, dto);
    const last = await this.prisma.lesson.aggregate({ where: { courseId, sectionId: dto.sectionId ?? null }, _max: { sortOrder: true } });
    const lesson = await this.prisma.lesson.create({
      data: {
        schoolId,
        courseId,
        sectionId: dto.sectionId,
        title: dto.title.trim(),
        type: dto.type,
        content: dto.content,
        fileId: dto.fileId,
        url: dto.url,
        testId: dto.testId,
        durationMin: dto.durationMin,
        isRequired: dto.isRequired ?? true,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      include: lessonInclude,
    });
    await this.attachTest(schoolId, courseId, lesson.type, lesson.testId);
    return lesson;
  }

  async updateLesson(schoolId: string, id: string, dto: UpdateLessonDto) {
    const existing = await this.lesson(schoolId, id);
    if (dto.sectionId) {
      const s = await this.prisma.courseSection.findFirst({ where: { id: dto.sectionId, courseId: existing.courseId } });
      if (!s) throw new BadRequestException('Mục không thuộc khóa học này');
    }
    const type = dto.type ?? existing.type;
    const fields: LessonFields = {
      content: dto.content ?? existing.content,
      fileId: dto.fileId ?? existing.fileId,
      url: dto.url ?? existing.url,
      testId: dto.testId ?? existing.testId,
    };
    await this.validateLesson(schoolId, type, fields);
    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        sectionId: dto.sectionId,
        title: dto.title?.trim(),
        type,
        content: fields.content,
        fileId: fields.fileId,
        url: fields.url,
        testId: fields.testId,
        durationMin: dto.durationMin,
        isRequired: dto.isRequired,
      },
      include: lessonInclude,
    });
    await this.attachTest(schoolId, lesson.courseId, lesson.type, lesson.testId);
    return lesson;
  }

  async removeLesson(schoolId: string, id: string) {
    await this.lesson(schoolId, id);
    await this.prisma.lesson.delete({ where: { id } });
    return { ok: true };
  }

  /** Rewrites section order, and each lesson's section and position, from the builder's layout. */
  async reorder(schoolId: string, courseId: string, dto: ReorderDto) {
    await this.access.course(schoolId, courseId);
    const [sections, lessons] = await Promise.all([
      this.prisma.courseSection.findMany({ where: { courseId }, select: { id: true } }),
      this.prisma.lesson.findMany({ where: { courseId }, select: { id: true } }),
    ]);
    const sectionIds = new Set(sections.map((s) => s.id));
    const lessonIds = new Set(lessons.map((l) => l.id));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let position = 0;
    for (const s of dto.sections) {
      if (s.id && !sectionIds.has(s.id)) throw new BadRequestException('Mục không thuộc khóa học này');
      if (s.lessonIds.some((l) => !lessonIds.has(l))) throw new BadRequestException('Bài học không thuộc khóa học này');
      if (s.id) ops.push(this.prisma.courseSection.update({ where: { id: s.id }, data: { sortOrder: position++ } }));
      s.lessonIds.forEach((lessonId, i) => ops.push(this.prisma.lesson.update({ where: { id: lessonId }, data: { sectionId: s.id ?? null, sortOrder: i } })));
    }
    await this.prisma.$transaction(ops);
    return this.get(schoolId, courseId);
  }

  // ---- enrolment ----

  /** Everyone enrolled, with their course progress and per-lesson status. */
  async students(schoolId: string, courseId: string) {
    await this.access.course(schoolId, courseId);
    const [sections, lessons, enrolments] = await Promise.all([
      this.prisma.courseSection.findMany({ where: { courseId }, select: { id: true, sortOrder: true } }),
      this.prisma.lesson.findMany({ where: { courseId }, select: { id: true, title: true, type: true, sectionId: true, sortOrder: true, isRequired: true } }),
      this.prisma.courseEnrollment.findMany({ where: { courseId }, include: { student: { select: studentSelect } }, orderBy: { student: { code: 'asc' } } }),
    ]);
    const ordered = flattenLessons(sections, lessons);
    const progress = await this.prisma.lessonProgress.findMany({
      where: { lessonId: { in: lessons.map((l) => l.id) }, studentId: { in: enrolments.map((e) => e.studentId) } },
      select: { lessonId: true, studentId: true, status: true, secondsSpent: true, completedAt: true, lastAt: true },
    });
    const students = enrolments.map((e) => {
      const mine = progress.filter((p) => p.studentId === e.studentId);
      const lastAt = mine.reduce<Date | null>((m, p) => (!m || p.lastAt > m ? p.lastAt : m), null);
      return {
        student: studentRef(e.student),
        enrolledAt: e.enrolledAt,
        progressPct: e.progressPct,
        completedAt: e.completedAt,
        lastAt,
        secondsSpent: mine.reduce((s, p) => s + p.secondsSpent, 0),
        lessons: Object.fromEntries(mine.map((p) => [p.lessonId, { status: p.status, secondsSpent: p.secondsSpent, completedAt: p.completedAt }])),
      };
    });
    return { lessons: ordered.map(({ id, title, type, isRequired }) => ({ id, title, type, isRequired })), students };
  }

  async enrol(schoolId: string, courseId: string, dto: EnrolStudentsDto) {
    await this.access.course(schoolId, courseId);
    const ids = [...new Set(dto.studentIds)];
    const students = await this.prisma.student.findMany({ where: { id: { in: ids }, schoolId }, select: { id: true } });
    if (students.length !== ids.length) throw new BadRequestException('Có học sinh không thuộc trường');
    const r = await this.prisma.courseEnrollment.createMany({ data: students.map((s) => ({ courseId, studentId: s.id })), skipDuplicates: true });
    return { added: r.count };
  }

  async unenrol(schoolId: string, courseId: string, studentId: string) {
    await this.access.course(schoolId, courseId);
    const r = await this.prisma.courseEnrollment.deleteMany({ where: { courseId, studentId } });
    if (!r.count) throw new NotFoundException('Học sinh chưa tham gia khóa học');
    return { ok: true };
  }

  // ---- internals ----

  private async section(schoolId: string, id: string) {
    const s = await this.prisma.courseSection.findFirst({ where: { id, course: { schoolId } } });
    if (!s) throw new NotFoundException('Không tìm thấy mục');
    return s;
  }

  private async lesson(schoolId: string, id: string) {
    const l = await this.prisma.lesson.findFirst({ where: { id, schoolId } });
    if (!l) throw new NotFoundException('Không tìm thấy bài học');
    return l;
  }

  /** Per-type completeness check against the real file and test rows of the school. */
  private async validateLesson(schoolId: string, type: LessonType, fields: LessonFields) {
    const refs: LessonRefs = {};
    if (fields.fileId) refs.file = await this.prisma.storedFile.findFirst({ where: { id: fields.fileId, schoolId }, select: { launchPath: true } });
    if (fields.testId) refs.testExists = !!(await this.prisma.test.findFirst({ where: { id: fields.testId, schoolId }, select: { id: true } }));
    const error = lessonValidationError(type, fields, refs);
    if (error) throw new BadRequestException(error);
  }

  /** A quiz test that was not yet tied to a course now belongs to this one. */
  private async attachTest(schoolId: string, courseId: string, type: LessonType, testId: string | null) {
    if (type !== LessonType.QUIZ || !testId) return;
    await this.prisma.test.updateMany({ where: { id: testId, schoolId, courseId: null }, data: { courseId } });
  }

  private async assertRefs(schoolId: string, dto: UpdateCourseDto, academicYearId: string | null) {
    if (academicYearId) {
      const y = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
      if (!y) throw new BadRequestException('Không tìm thấy năm học');
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId }, select: { id: true } });
      if (!s) throw new BadRequestException('Không tìm thấy môn học');
    }
    if (dto.classIds?.length) {
      const n = await this.prisma.class.count({ where: { id: { in: dto.classIds }, schoolId } });
      if (n !== new Set(dto.classIds).size) throw new BadRequestException('Có lớp không thuộc trường');
    }
    if (dto.coverFileId) {
      const f = await this.prisma.storedFile.findFirst({ where: { id: dto.coverFileId, schoolId }, select: { id: true } });
      if (!f) throw new BadRequestException('Không tìm thấy ảnh bìa');
    }
  }
}

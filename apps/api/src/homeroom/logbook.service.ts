import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { LessonLogStatus, Prisma, Role } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, dayOfWeek, daysBetween, eachDay, fromDbDate, isValidDate, mondayOf, semesterFor, toDbDate } from './dates';
import { HomeroomAccessService } from './homeroom-access.service';
import { LogbookQuery, LogbookStatsQuery, SaveLessonLogDto } from './homeroom.dto';

const MAX_DAYS = 14;
const MAX_STATS_DAYS = 366;

const isRating = (r: number) => Number.isFinite(r) && r >= 1 && r <= 10;

const include = {
  subject: { select: { id: true, code: true, name: true } },
  teacher: { select: { id: true, code: true, fullName: true } },
} satisfies Prisma.LessonLogInclude;

type LogRow = Prisma.LessonLogGetPayload<{ include: typeof include }>;

/** The rating column is text; the API speaks numbers 1-10. */
const formatLog = (l: LogRow) => ({
  id: l.id,
  date: fromDbDate(l.date),
  periodNumber: l.periodNumber,
  semester: l.semester,
  subject: l.subject,
  teacher: l.teacher,
  content: l.content,
  comment: l.comment,
  rating: l.rating == null || l.rating === '' || isNaN(Number(l.rating)) ? null : Number(l.rating),
  status: l.status,
  absentStudentIds: l.absentStudentIds,
  updatedAt: l.updatedAt,
});

/** Sổ đầu bài: what was taught in each period, who was absent and how the lesson went. */
@Injectable()
export class LogbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HomeroomAccessService,
    private readonly years: AcademicYearsService,
  ) {}

  /** Timetable slots of each school day (Mon-Sat) in the range, joined with the entries written so far. */
  async list(user: AuthUser, query: LogbookQuery) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { timezone: true } });
    const klass = await this.access.getClass(user.schoolId, query.classId);
    const from = query.from ?? mondayOf(localDate(new Date(), school.timezone));
    const to = query.to ?? addDays(from, 5);
    this.assertRange(from, to, MAX_DAYS);
    const year = await this.years.current(user.schoolId);
    const [entries, logs, students] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { classId: klass.id, academicYearId: year.id },
        include: { subject: include.subject, teacher: include.teacher },
      }),
      this.prisma.lessonLog.findMany({ where: { classId: klass.id, date: { gte: toDbDate(from), lte: toDbDate(to) } }, include }),
      this.access.roster(klass.id),
    ]);

    const days = eachDay(from, to)
      .filter((date) => dayOfWeek(date) !== 7)
      .map((date) => {
        const dow = dayOfWeek(date);
        const semester = semesterFor(date, year);
        const dayLogs = logs.filter((l) => fromDbDate(l.date) === date);
        const slots = entries
          .filter((e) => e.dayOfWeek === dow && e.semester === semester)
          .map((e) => {
            const log = dayLogs.find((l) => l.periodNumber === e.periodNumber);
            return { periodNumber: e.periodNumber, subject: e.subject, teacher: e.teacher, room: e.room, scheduled: true, log: log ? formatLog(log) : null };
          });
        // Entries written outside the timetable (a swapped or extra period) still show up.
        for (const l of dayLogs) {
          if (!slots.some((s) => s.periodNumber === l.periodNumber)) {
            slots.push({ periodNumber: l.periodNumber, subject: l.subject, teacher: l.teacher, room: null, scheduled: false, log: formatLog(l) });
          }
        }
        slots.sort((a, b) => a.periodNumber - b.periodNumber);
        return { date, dayOfWeek: dow, semester, slots };
      });

    return {
      class: { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, homeroomTeacherId: klass.homeroomTeacherId },
      academicYear: { id: year.id, name: year.name },
      from,
      to,
      students,
      days,
    };
  }

  /** Writes one period's entry. Teachers may write the periods they teach or any period of their homeroom class. */
  async save(user: AuthUser, dto: SaveLessonLogDto) {
    if (!isValidDate(dto.date)) throw new BadRequestException('Ngày không hợp lệ');
    const klass = await this.access.getClass(user.schoolId, dto.classId);
    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId: user.schoolId }, select: { id: true } });
    if (!subject) throw new BadRequestException('Môn học không hợp lệ');
    const absent = [...new Set(dto.absentStudentIds ?? [])];
    if (absent.length) {
      const roster = await this.access.roster(klass.id);
      if (absent.some((id) => !roster.some((s) => s.id === id))) throw new BadRequestException('Học sinh không thuộc lớp này');
    }
    if (dto.status === LessonLogStatus.DONE && !dto.content.trim()) throw new BadRequestException('Nhập nội dung bài dạy');

    const year = await this.years.current(user.schoolId);
    const semester = dto.semester ?? semesterFor(dto.date, year);
    const slot = await this.prisma.timetableEntry.findFirst({
      where: { classId: klass.id, academicYearId: year.id, semester, dayOfWeek: dayOfWeek(dto.date), periodNumber: dto.periodNumber },
      select: { teacherId: true },
    });
    const teacherId = await this.resolveTeacher(user, klass, slot?.teacherId ?? null, dto);

    const where = { classId_date_periodNumber: { classId: klass.id, date: toDbDate(dto.date), periodNumber: dto.periodNumber } };
    const data = {
      subjectId: dto.subjectId,
      teacherId,
      semester,
      content: dto.content,
      comment: dto.comment ?? null,
      rating: dto.rating == null ? null : String(dto.rating),
      status: dto.status,
      absentStudentIds: absent,
    };
    const log = await this.prisma.lessonLog.upsert({
      where,
      create: { schoolId: user.schoolId, classId: klass.id, date: toDbDate(dto.date), periodNumber: dto.periodNumber, ...data },
      update: data,
      include,
    });
    return formatLog(log);
  }

  /** Lessons taught / cancelled, the average rating and absences per student over a date range. */
  async stats(user: AuthUser, query: LogbookStatsQuery) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { timezone: true } });
    const klass = await this.access.getClass(user.schoolId, query.classId);
    const today = localDate(new Date(), school.timezone);
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? (today >= from ? today : from);
    this.assertRange(from, to, MAX_STATS_DAYS);
    const [logs, roster] = await Promise.all([
      this.prisma.lessonLog.findMany({
        where: { classId: klass.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        select: { status: true, rating: true, absentStudentIds: true },
      }),
      this.access.roster(klass.id),
    ]);
    const done = logs.filter((l) => l.status === LessonLogStatus.DONE);
    const ratings = done.map((l) => Number(l.rating)).filter(isRating);
    const absences = new Map<string, number>();
    for (const l of done) for (const id of l.absentStudentIds) absences.set(id, (absences.get(id) ?? 0) + 1);
    const students = new Map(roster.map((s) => [s.id, s]));
    return {
      class: { id: klass.id, name: klass.name },
      from,
      to,
      lessons: { total: logs.length, done: done.length, cancelled: logs.length - done.length },
      averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      absences: [...absences]
        .filter(([id]) => students.has(id))
        .map(([id, count]) => ({ student: students.get(id)!, count }))
        .sort((a, b) => b.count - a.count || a.student.fullName.localeCompare(b.student.fullName)),
    };
  }

  // ---- internals ----

  private assertRange(from: string, to: string, maxDays: number) {
    if (!isValidDate(from) || !isValidDate(to)) throw new BadRequestException('Ngày không hợp lệ');
    if (to < from) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    if (daysBetween(from, to) >= maxDays) throw new BadRequestException(`Khoảng ngày tối đa ${maxDays} ngày`);
  }

  /** Who the entry is recorded for: the caller when they are a teacher, else an explicit or timetabled teacher. */
  private async resolveTeacher(user: AuthUser, klass: { homeroomTeacherId: string | null }, slotTeacherId: string | null, dto: SaveLessonLogDto) {
    if (user.role === Role.TEACHER) {
      const teacher = await this.access.teacherOf(user);
      if (!teacher) throw new ForbiddenException('Tài khoản chưa gắn với hồ sơ giáo viên');
      if (klass.homeroomTeacherId !== teacher.id && slotTeacherId !== teacher.id) {
        throw new ForbiddenException('Bạn không dạy tiết này và không phải giáo viên chủ nhiệm lớp');
      }
      return teacher.id;
    }
    if (dto.teacherId) {
      const teacher = await this.prisma.teacher.findFirst({ where: { id: dto.teacherId, schoolId: user.schoolId }, select: { id: true } });
      if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');
      return teacher.id;
    }
    const fallback = slotTeacherId ?? (await this.access.teacherOf(user))?.id ?? klass.homeroomTeacherId;
    if (!fallback) throw new BadRequestException('Chọn giáo viên dạy tiết này');
    return fallback;
  }
}

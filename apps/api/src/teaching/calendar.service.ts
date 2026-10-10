import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { addDays, dayOfWeek, eachDay, fromDbDate, isValidDate, mondayOf, semesterFor, toDbDate } from '../homeroom/dates';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarQuery, SaveCalendarDto } from './teaching.dto';
import { schoolWeek } from './workload';

const planInclude = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
} satisfies Prisma.LessonPlanInclude;

type PlanRow = Prisma.LessonPlanGetPayload<{ include: typeof planInclude }>;

const formatPlan = (p: PlanRow) => ({ id: p.id, lessonNo: p.lessonNo, title: p.title, aids: p.aids, note: p.note, class: p.class, subject: p.subject });

/**
 * Lịch báo giảng: a teacher's week from the timetable, with the lesson planned for each
 * period. The teacher writes it; the school's leaders read and print every teacher's.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  /** The teacher asked for, or the caller's own teacher record. */
  private async teacherFor(user: AuthUser, teacherId?: string) {
    const teacher = teacherId
      ? await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId: user.schoolId }, select: { id: true, code: true, fullName: true, userId: true } })
      : await this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true, code: true, fullName: true, userId: true } });
    if (!teacher) throw teacherId ? new NotFoundException('Không tìm thấy giáo viên') : new BadRequestException('Chọn giáo viên');
    return teacher;
  }

  /** The teacher writes their own; the principal and vice principals (admin) may write anyone's. */
  private canEdit(user: AuthUser, teacher: { userId: string | null }) {
    return user.role === Role.ADMIN || (!!teacher.userId && teacher.userId === user.userId);
  }

  async week(user: AuthUser, query: CalendarQuery) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { timezone: true } });
    const teacher = await this.teacherFor(user, query.teacherId);
    const monday = mondayOf(query.date ?? localDate(new Date(), school.timezone));
    const sunday = addDays(monday, 6);
    const year = await this.years.current(user.schoolId);
    const [entries, plans, periods] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { teacherId: teacher.id, academicYearId: year.id },
        select: { semester: true, dayOfWeek: true, periodNumber: true, room: true, class: { select: { id: true, name: true } }, subject: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.lessonPlan.findMany({ where: { teacherId: teacher.id, date: { gte: toDbDate(monday), lte: toDbDate(sunday) } }, include: planInclude }),
      this.prisma.period.findMany({ where: { schoolId: user.schoolId }, select: { number: true, session: true, startTime: true, endTime: true } }),
    ]);
    const period = new Map(periods.map((p) => [p.number, p]));
    const inYear = (date: string) => date >= fromDbDate(year.startDate) && date <= fromDbDate(year.endDate);

    const days = eachDay(monday, sunday)
      .filter((date) => dayOfWeek(date) !== 7 || plans.some((p) => fromDbDate(p.date) === date))
      .map((date) => {
        const semester = semesterFor(date, year);
        const dayPlans = plans.filter((p) => fromDbDate(p.date) === date);
        const slots = (inYear(date) ? entries.filter((e) => e.dayOfWeek === dayOfWeek(date) && e.semester === semester) : []).map((e) => {
          const plan = dayPlans.find((p) => p.periodNumber === e.periodNumber);
          return { periodNumber: e.periodNumber, class: e.class, subject: e.subject, room: e.room, scheduled: true, plan: plan ? formatPlan(plan) : null };
        });
        // Lessons planned outside the timetable (a swapped or make-up period) still show up.
        for (const p of dayPlans) {
          if (!slots.some((s) => s.periodNumber === p.periodNumber)) slots.push({ periodNumber: p.periodNumber, class: p.class, subject: p.subject, room: null, scheduled: false, plan: formatPlan(p) });
        }
        slots.sort((a, b) => a.periodNumber - b.periodNumber);
        return {
          date,
          dayOfWeek: dayOfWeek(date),
          semester,
          slots: slots.map((s) => {
            const p = period.get(s.periodNumber);
            return { ...s, session: p?.session ?? null, startTime: p?.startTime ?? null, endTime: p?.endTime ?? null };
          }),
        };
      });

    const number = schoolWeek(monday, fromDbDate(year.startDate));
    return {
      teacher: { id: teacher.id, code: teacher.code, fullName: teacher.fullName },
      academicYear: { id: year.id, name: year.name },
      week: { number: number > 0 && monday <= fromDbDate(year.endDate) ? number : null, from: monday, to: addDays(monday, 5) },
      editable: this.canEdit(user, teacher),
      planned: plans.length,
      periods: days.reduce((a, d) => a + d.slots.filter((s) => s.scheduled).length, 0),
      days,
    };
  }

  /** Writes the lessons of some periods; an empty title takes a period off the calendar. */
  async save(user: AuthUser, dto: SaveCalendarDto) {
    const teacher = await this.teacherFor(user, dto.teacherId);
    if (!this.canEdit(user, teacher)) throw new ForbiddenException('Chỉ giáo viên hoặc ban giám hiệu được sửa lịch báo giảng');
    if (!dto.entries.length) throw new BadRequestException('Chưa có tiết nào');
    const keys = dto.entries.map((e) => `${e.date}|${e.periodNumber}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Một tiết chỉ ghi một lần');
    for (const e of dto.entries) if (!isValidDate(e.date)) throw new BadRequestException(`Ngày không hợp lệ: ${e.date}`);
    const classIds = [...new Set(dto.entries.map((e) => e.classId))];
    const subjectIds = [...new Set(dto.entries.map((e) => e.subjectId))];
    const numbers = [...new Set(dto.entries.map((e) => e.periodNumber))];
    const [classes, subjects, periods] = await Promise.all([
      this.prisma.class.count({ where: { schoolId: user.schoolId, id: { in: classIds } } }),
      this.prisma.subject.count({ where: { schoolId: user.schoolId, id: { in: subjectIds } } }),
      this.prisma.period.count({ where: { schoolId: user.schoolId, number: { in: numbers } } }),
    ]);
    if (classes !== classIds.length) throw new BadRequestException('Lớp không hợp lệ');
    if (subjects !== subjectIds.length) throw new BadRequestException('Môn học không hợp lệ');
    if (periods !== numbers.length) throw new BadRequestException('Tiết học chưa được khai báo trong khung giờ của trường');

    await this.prisma.$transaction(
      dto.entries.map((e) => {
        const where = { teacherId_date_periodNumber: { teacherId: teacher.id, date: toDbDate(e.date), periodNumber: e.periodNumber } };
        const title = e.title.trim();
        if (!title) return this.prisma.lessonPlan.deleteMany({ where: where.teacherId_date_periodNumber });
        const data = { classId: e.classId, subjectId: e.subjectId, lessonNo: e.lessonNo ?? null, title, aids: e.aids?.trim() || null, note: e.note?.trim() || null };
        return this.prisma.lessonPlan.upsert({ where, create: { schoolId: user.schoolId, teacherId: teacher.id, date: toDbDate(e.date), periodNumber: e.periodNumber, ...data }, update: data });
      }),
    );
    return this.week(user, { teacherId: teacher.id, date: dto.entries[0].date });
  }
}

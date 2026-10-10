import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Gender, HomeroomStatus, ParentMeeting, PolicyGroup, Prisma, ResultLevel, Role, StudentStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { GradeControlService } from '../grades/control.service';
import { orderSubjects } from '../grades/results';
import { TITLE_EXCELLENT, TITLE_GOOD, YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { residence } from '../students/record-labels';
import { fromDbDate, isValidDate, toDbDate } from './dates';
import { HomeroomAccessService, studentSelect } from './homeroom-access.service';
import { BookQuery, BookReviewDto, MeetingDto, MonthPlanDto, SaveBookDto, StudentNoteDto, UpdateMeetingDto, UpdateStudentNoteDto } from './homeroom-book.dto';
import { bookSpan, cleanCommittee, cleanGroups, cleanOfficers, cleanSeating, CommitteeMember, Group, jsonList, jsonPlan, jsonSeating, mergePlan, Officer, Roster } from './homeroom-book.rules';

export const BOOK_WRITE_ONLY = 'Chỉ giáo viên chủ nhiệm lớp hoặc ban giám hiệu được ghi sổ chủ nhiệm';

const LEVELS: ResultLevel[] = [ResultLevel.TOT, ResultLevel.KHA, ResultLevel.DAT, ResultLevel.CHUA_DAT];

const classSelect = {
  id: true,
  name: true,
  gradeLevel: true,
  room: true,
  homeroomTeacherId: true,
  academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
  homeroomTeacher: { select: { id: true, code: true, fullName: true, phone: true, userId: true } },
} satisfies Prisma.ClassSelect;

type Klass = Prisma.ClassGetPayload<{ select: typeof classSelect }>;

const studentDetail = {
  ...studentSelect,
  gender: true,
  dateOfBirth: true,
  ethnicity: true,
  religion: true,
  address: true,
  currentWard: true,
  currentProvince: true,
  policyGroups: true,
  youngPioneer: true,
  youthUnion: true,
  guardians: { select: { id: true, fullName: true, relationship: true, phone: true, occupation: true, isPrimary: true }, orderBy: [{ relationship: 'asc' }, { isPrimary: 'desc' }] },
} satisfies Prisma.StudentSelect;

type Ref = { id: string; code: string; fullName: string };

const clean = (v: string | null | undefined) => v?.trim() || null;
const tally = (list: (ResultLevel | null)[]) => Object.fromEntries(LEVELS.map((l) => [l, list.filter((x) => x === l).length])) as Record<ResultLevel, number>;
/** "Không" is how the forms record no religion. */
const hasReligion = (r: string | null) => !!r?.trim() && !/^kh[oô]ng$/i.test(r.trim());

const formatMonth = (p: { id: string; month: Date; theme: string | null; tasks: string; review: string | null }) => ({ id: p.id, month: fromDbDate(p.month).slice(0, 7), theme: p.theme, tasks: p.tasks, review: p.review });

const formatMeeting = (m: ParentMeeting) => ({
  id: m.id,
  date: fromDbDate(m.date),
  title: m.title,
  attended: m.attended,
  invited: m.invited,
  content: m.content,
  opinions: m.opinions,
  conclusions: m.conclusions,
});

const noteInclude = { student: { select: studentSelect } } satisfies Prisma.StudentNoteInclude;
const formatNote = (n: Prisma.StudentNoteGetPayload<{ include: typeof noteInclude }>) => ({ id: n.id, date: fromDbDate(n.date), kind: n.kind, content: n.content, action: n.action, result: n.result, student: n.student });

/**
 * Sổ chủ nhiệm: the homeroom teacher's book of the class for the school year. Its
 * general part (subject teachers, students and their families, the class's situation,
 * marks and attendance) is read from the rest of the system; the teacher writes the
 * class officers, the parents' committee, the tổ and seating chart, the year and month
 * plans, parent meetings and the students they follow. The school's leaders read it and
 * write their review.
 */
@Injectable()
export class HomeroomBookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HomeroomAccessService,
    private readonly control: GradeControlService,
  ) {}

  /** The class, when the caller may read its book: its homeroom teacher or the school office. */
  private async open(user: AuthUser, classId: string): Promise<Klass> {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId: user.schoolId }, select: classSelect });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    await this.access.assertHomeroom(user, klass);
    return klass;
  }

  /** The homeroom teacher writes the book, and the school's leaders (admin) may; office staff only read it. */
  private editable(user: AuthUser, klass: Klass) {
    return user.role === Role.ADMIN || (user.role === Role.TEACHER && !!klass.homeroomTeacher?.userId && klass.homeroomTeacher.userId === user.userId);
  }

  private async writable(user: AuthUser, classId: string) {
    const klass = await this.open(user, classId);
    if (!this.editable(user, klass)) throw new ForbiddenException(BOOK_WRITE_ONLY);
    return klass;
  }

  private span(klass: Klass) {
    return bookSpan({ startDate: fromDbDate(klass.academicYear.startDate), endDate: fromDbDate(klass.academicYear.endDate) });
  }

  /** A day of the school year the book covers. */
  private day(klass: Klass, date: string) {
    const span = this.span(klass);
    if (!isValidDate(date) || date < span.from || date > span.to) throw new BadRequestException(`Ngày phải thuộc năm học ${klass.academicYear.name}`);
    return toDbDate(date);
  }

  private async today(schoolId: string) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return localDate(new Date(), school.timezone);
  }

  /** Students studying in the class, by id. */
  private async roster(classId: string): Promise<Roster> {
    return new Map((await this.access.roster(classId)).map((s) => [s.id, s.fullName]));
  }

  // ---- the book ----

  async book(user: AuthUser, query: BookQuery) {
    const klass = await this.open(user, query.classId);
    const year = klass.academicYear;
    const [book, enrollments, monthPlans, meetings, notes, reviews, hk1, hk2] = await Promise.all([
      this.prisma.homeroomBook.findUnique({ where: { classId: klass.id } }),
      this.prisma.enrollment.findMany({ where: { classId: klass.id, student: { status: StudentStatus.STUDYING } }, select: { student: { select: studentDetail } }, orderBy: { student: { fullName: 'asc' } } }),
      this.prisma.homeroomMonthPlan.findMany({ where: { classId: klass.id }, orderBy: { month: 'asc' } }),
      this.prisma.parentMeeting.findMany({ where: { classId: klass.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.studentNote.findMany({ where: { classId: klass.id }, include: noteInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.homeroomBookReview.findMany({ where: { classId: klass.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.control.taught(user.schoolId, year.id, 1, { classId: klass.id }),
      this.control.taught(user.schoolId, year.id, 2, { classId: klass.id }),
    ]);
    const students = enrollments.map((e) => e.student);
    const ids = students.map((s) => s.id);
    const userIds = [...new Set([...reviews.map((r) => r.authorId), ...(book?.updatedById ? [book.updatedById] : [])])];
    const [attendance, results, awards, disciplines, previous, users] = await Promise.all([
      this.prisma.homeroomAttendance.groupBy({ by: ['studentId', 'status'], where: { studentId: { in: ids }, date: { gte: year.startDate, lte: year.endDate } }, _count: { _all: true } }),
      this.prisma.termResult.findMany({
        where: { studentId: { in: ids }, academicYearId: year.id },
        select: { studentId: true, semester: true, academic: true, conduct: true, title: true, academicAfterRetake: true, conductAfterTraining: true },
      }),
      this.prisma.studentAward.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, academicYearId: year.id }, _count: { _all: true } }),
      this.prisma.studentDiscipline.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, academicYearId: year.id }, _count: { _all: true } }),
      this.previousYear(user.schoolId, year.startDate, ids),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.fullName]));

    // Officers, groups and seats whose student has left the class drop out of the book.
    const byId = new Map(students.map((s) => [s.id, { id: s.id, code: s.code, fullName: s.fullName }]));
    const ref = (id: string | null | undefined): Ref | null => (id ? (byId.get(id) ?? null) : null);
    const guardians = new Map(students.flatMap((s) => s.guardians.map((g) => [g.id, { guardian: { id: g.id, fullName: g.fullName, relationship: g.relationship, phone: g.phone }, student: byId.get(s.id)! }] as const)));

    const officers = jsonList<Officer>(book?.officers).flatMap((o) => {
      const student = ref(o.studentId);
      return student ? [{ role: o.role, student }] : [];
    });
    const parentCommittee = jsonList<CommitteeMember>(book?.parentCommittee).flatMap((m) => {
      const g = guardians.get(m.guardianId);
      return g ? [{ role: m.role, ...g }] : [];
    });
    const groups = jsonList<Group>(book?.groups).map((g) => ({ name: g.name, leader: ref(g.leaderId), students: g.studentIds.map(ref).filter((s): s is Ref => !!s) }));
    const grouped = new Set(groups.flatMap((g) => g.students.map((s) => s.id)));
    const stored = jsonSeating(book?.seating);
    const seating = stored ? { columns: stored.columns, rows: stored.rows, seatsPerDesk: stored.seatsPerDesk, seats: stored.seats.map((row) => row.map(ref)) } : null;
    const seated = new Set(seating ? seating.seats.flat().flatMap((s) => (s ? [s.id] : [])) : []);

    // Danh sách giáo viên bộ môn of each semester, from the teaching assignments (or the timetable).
    const subjects = orderSubjects([...new Map([...hk1, ...hk2].map((r) => [r.subject.id, r.subject])).values()]);
    const teachersOf = (rows: typeof hk1, subjectId: string) => [...new Set(rows.filter((r) => r.subjectId === subjectId).map((r) => r.teacher.fullName))];

    const count = <T extends { studentId: string; _count: { _all: number } }>(rows: T[], studentId: string, match: (r: T) => boolean = () => true) =>
      rows.filter((r) => r.studentId === studentId && match(r)).reduce((a, r) => a + r._count._all, 0);
    const resultOf = (studentId: string, semester: number) => {
      const r = results.find((x) => x.studentId === studentId && x.semester === semester);
      return r ? { academic: semester === YEAR ? (r.academicAfterRetake ?? r.academic) : r.academic, conduct: semester === YEAR ? (r.conductAfterTraining ?? r.conduct) : r.conduct, title: r.title } : null;
    };

    return {
      class: {
        id: klass.id,
        name: klass.name,
        gradeLevel: klass.gradeLevel,
        room: klass.room,
        academicYear: { id: year.id, name: year.name, startDate: fromDbDate(year.startDate), endDate: fromDbDate(year.endDate) },
        homeroomTeacher: klass.homeroomTeacher ? { id: klass.homeroomTeacher.id, code: klass.homeroomTeacher.code, fullName: klass.homeroomTeacher.fullName, phone: klass.homeroomTeacher.phone } : null,
      },
      editable: this.editable(user, klass),
      canReview: user.role === Role.ADMIN,
      span: this.span(klass),
      subjectTeachers: subjects.map((s) => ({ subject: s, semester1: teachersOf(hk1, s.id), semester2: teachersOf(hk2, s.id) })),
      situation: {
        total: students.length,
        female: students.filter((s) => s.gender === Gender.FEMALE).length,
        ethnicMinority: students.filter((s) => !!s.ethnicity?.trim() && s.ethnicity.trim().toLowerCase() !== 'kinh').length,
        religion: students.filter((s) => hasReligion(s.religion)).length,
        youngPioneer: students.filter((s) => s.youngPioneer).length,
        youthUnion: students.filter((s) => s.youthUnion).length,
        policy: Object.values(PolicyGroup)
          .map((group) => ({ group, count: students.filter((s) => s.policyGroups.includes(group)).length }))
          .filter((p) => p.count),
        previous,
      },
      students: students.map((s) => ({
        id: s.id,
        code: s.code,
        fullName: s.fullName,
        gender: s.gender,
        dateOfBirth: s.dateOfBirth ? fromDbDate(s.dateOfBirth) : null,
        ethnicity: s.ethnicity,
        religion: s.religion,
        residence: residence(s),
        policyGroups: s.policyGroups,
        youngPioneer: s.youngPioneer,
        youthUnion: s.youthUnion,
        guardians: s.guardians,
        absences: {
          excused: count(attendance, s.id, (r) => r.status === HomeroomStatus.EXCUSED),
          unexcused: count(attendance, s.id, (r) => r.status === HomeroomStatus.ABSENT),
          late: count(attendance, s.id, (r) => r.status === HomeroomStatus.LATE),
        },
        results: { semester1: resultOf(s.id, 1), semester2: resultOf(s.id, 2), year: resultOf(s.id, YEAR) },
        awards: count(awards, s.id),
        disciplines: count(disciplines, s.id),
      })),
      officers,
      parentCommittee,
      groups,
      ungrouped: [...byId.values()].filter((s) => !grouped.has(s.id)),
      seating,
      unseated: [...byId.values()].filter((s) => !seated.has(s.id)),
      yearPlan: jsonPlan(book?.yearPlan),
      monthPlans: monthPlans.map(formatMonth),
      meetings: meetings.map(formatMeeting),
      notes: notes.map(formatNote),
      reviews: reviews.map((r) => ({ id: r.id, date: fromDbDate(r.date), content: r.content, author: userName.get(r.authorId) ?? '', mine: r.authorId === user.userId })),
      updatedAt: book?.updatedAt ?? null,
      updatedBy: book?.updatedById ? (userName.get(book.updatedById) ?? null) : null,
    };
  }

  /** How the class's students finished the previous school year, for "đặc điểm tình hình lớp". */
  private async previousYear(schoolId: string, startDate: Date, ids: string[]) {
    const prev = await this.prisma.academicYear.findFirst({ where: { schoolId, startDate: { lt: startDate } }, orderBy: { startDate: 'desc' }, select: { id: true, name: true } });
    if (!prev || !ids.length) return null;
    const rows = await this.prisma.termResult.findMany({
      where: { academicYearId: prev.id, semester: YEAR, studentId: { in: ids } },
      select: { academic: true, conduct: true, academicAfterRetake: true, conductAfterTraining: true, title: true },
    });
    if (!rows.length) return null;
    return {
      academicYear: prev,
      students: rows.length,
      academic: tally(rows.map((r) => r.academicAfterRetake ?? r.academic)),
      conduct: tally(rows.map((r) => r.conductAfterTraining ?? r.conduct)),
      excellent: rows.filter((r) => r.title === TITLE_EXCELLENT).length,
      good: rows.filter((r) => r.title === TITLE_GOOD).length,
    };
  }

  /** Saves the parts sent (officers, parents' committee, tổ, seating chart, year plan); the rest stay. */
  async save(user: AuthUser, dto: SaveBookDto) {
    const klass = await this.writable(user, dto.classId);
    const roster = await this.roster(klass.id);
    const data: Omit<Prisma.HomeroomBookUncheckedCreateInput, 'schoolId' | 'classId'> = { updatedById: user.userId };
    if (dto.officers) data.officers = cleanOfficers(dto.officers, roster);
    if (dto.parentCommittee) {
      const guardians = await this.prisma.guardian.findMany({ where: { studentId: { in: [...roster.keys()] } }, select: { id: true } });
      data.parentCommittee = cleanCommittee(dto.parentCommittee, new Set(guardians.map((g) => g.id)));
    }
    if (dto.groups) data.groups = cleanGroups(dto.groups, roster);
    if (dto.seating !== undefined) data.seating = dto.seating === null ? Prisma.DbNull : cleanSeating(dto.seating, roster);
    if (dto.yearPlan) {
      const kept = await this.prisma.homeroomBook.findUnique({ where: { classId: klass.id }, select: { yearPlan: true } });
      data.yearPlan = mergePlan(jsonPlan(kept?.yearPlan), dto.yearPlan);
    }
    await this.prisma.homeroomBook.upsert({ where: { classId: klass.id }, create: { schoolId: user.schoolId, classId: klass.id, ...data }, update: data });
    return this.book(user, { classId: klass.id });
  }

  // ---- kế hoạch từng tháng ----

  async saveMonth(user: AuthUser, dto: MonthPlanDto) {
    const klass = await this.writable(user, dto.classId);
    const span = this.span(klass);
    if (dto.month < span.from.slice(0, 7) || dto.month > span.to.slice(0, 7)) throw new BadRequestException(`Tháng phải thuộc năm học ${klass.academicYear.name}`);
    if (!dto.tasks.trim()) throw new BadRequestException('Nhập nội dung kế hoạch');
    const month = toDbDate(`${dto.month}-01`);
    const data = { theme: clean(dto.theme), tasks: dto.tasks.trim(), review: clean(dto.review) };
    const row = await this.prisma.homeroomMonthPlan.upsert({ where: { classId_month: { classId: klass.id, month } }, create: { schoolId: user.schoolId, classId: klass.id, month, ...data }, update: data });
    return formatMonth(row);
  }

  async removeMonth(user: AuthUser, id: string) {
    const row = await this.prisma.homeroomMonthPlan.findFirst({ where: { id, schoolId: user.schoolId }, select: { classId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy kế hoạch tháng');
    await this.writable(user, row.classId);
    await this.prisma.homeroomMonthPlan.delete({ where: { id } });
  }

  // ---- họp cha mẹ học sinh ----

  private static checkAttendance(attended: number | null | undefined, invited: number | null | undefined) {
    if (attended != null && invited != null && attended > invited) throw new BadRequestException('Số phụ huynh dự họp không thể nhiều hơn số được mời');
  }

  async addMeeting(user: AuthUser, dto: MeetingDto) {
    const klass = await this.writable(user, dto.classId);
    HomeroomBookService.checkAttendance(dto.attended, dto.invited);
    const row = await this.prisma.parentMeeting.create({
      data: {
        schoolId: user.schoolId,
        classId: klass.id,
        date: this.day(klass, dto.date),
        title: dto.title.trim(),
        attended: dto.attended ?? null,
        invited: dto.invited ?? null,
        content: dto.content.trim(),
        opinions: clean(dto.opinions),
        conclusions: clean(dto.conclusions),
        createdById: user.userId,
      },
    });
    return formatMeeting(row);
  }

  async updateMeeting(user: AuthUser, id: string, dto: UpdateMeetingDto) {
    const row = await this.prisma.parentMeeting.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!row) throw new NotFoundException('Không tìm thấy biên bản họp');
    const klass = await this.writable(user, row.classId);
    const attended = dto.attended !== undefined ? dto.attended : row.attended;
    const invited = dto.invited !== undefined ? dto.invited : row.invited;
    HomeroomBookService.checkAttendance(attended, invited);
    const updated = await this.prisma.parentMeeting.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: this.day(klass, dto.date) } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        attended: attended ?? null,
        invited: invited ?? null,
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.opinions !== undefined ? { opinions: clean(dto.opinions) } : {}),
        ...(dto.conclusions !== undefined ? { conclusions: clean(dto.conclusions) } : {}),
      },
    });
    return formatMeeting(updated);
  }

  async removeMeeting(user: AuthUser, id: string) {
    const row = await this.prisma.parentMeeting.findFirst({ where: { id, schoolId: user.schoolId }, select: { classId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy biên bản họp');
    await this.writable(user, row.classId);
    await this.prisma.parentMeeting.delete({ where: { id } });
  }

  // ---- theo dõi học sinh ----

  private async assertStudying(classId: string, studentId: string) {
    const e = await this.prisma.enrollment.findFirst({ where: { classId, studentId, student: { status: StudentStatus.STUDYING } }, select: { id: true } });
    if (!e) throw new BadRequestException('Học sinh không thuộc lớp');
  }

  async addNote(user: AuthUser, dto: StudentNoteDto) {
    const klass = await this.writable(user, dto.classId);
    await this.assertStudying(klass.id, dto.studentId);
    const row = await this.prisma.studentNote.create({
      data: {
        schoolId: user.schoolId,
        classId: klass.id,
        studentId: dto.studentId,
        date: this.day(klass, dto.date),
        kind: dto.kind,
        content: dto.content.trim(),
        action: clean(dto.action),
        result: clean(dto.result),
        createdById: user.userId,
      },
      include: noteInclude,
    });
    return formatNote(row);
  }

  async updateNote(user: AuthUser, id: string, dto: UpdateStudentNoteDto) {
    const row = await this.prisma.studentNote.findFirst({ where: { id, schoolId: user.schoolId }, select: { classId: true, studentId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy ghi chép');
    const klass = await this.writable(user, row.classId);
    if (dto.studentId !== undefined && dto.studentId !== row.studentId) await this.assertStudying(klass.id, dto.studentId);
    const updated = await this.prisma.studentNote.update({
      where: { id },
      data: {
        ...(dto.studentId !== undefined ? { studentId: dto.studentId } : {}),
        ...(dto.date !== undefined ? { date: this.day(klass, dto.date) } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.action !== undefined ? { action: clean(dto.action) } : {}),
        ...(dto.result !== undefined ? { result: clean(dto.result) } : {}),
      },
      include: noteInclude,
    });
    return formatNote(updated);
  }

  async removeNote(user: AuthUser, id: string) {
    const row = await this.prisma.studentNote.findFirst({ where: { id, schoolId: user.schoolId }, select: { classId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy ghi chép');
    await this.writable(user, row.classId);
    await this.prisma.studentNote.delete({ where: { id } });
  }

  // ---- ý kiến của ban giám hiệu (admin only, checked by the controller) ----

  async addReview(user: AuthUser, dto: BookReviewDto) {
    const klass = await this.open(user, dto.classId);
    const span = this.span(klass);
    const today = await this.today(user.schoolId);
    // Reviewing a past year's book dates the review at the end of that year unless told otherwise.
    const date = dto.date ?? (today > span.to ? span.to : today < span.from ? span.from : today);
    const row = await this.prisma.homeroomBookReview.create({ data: { schoolId: user.schoolId, classId: klass.id, date: this.day(klass, date), content: dto.content.trim(), authorId: user.userId } });
    const author = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { fullName: true } });
    return { id: row.id, date: fromDbDate(row.date), content: row.content, author: author?.fullName ?? '', mine: true };
  }

  async removeReview(user: AuthUser, id: string) {
    const row = await this.prisma.homeroomBookReview.findFirst({ where: { id, schoolId: user.schoolId }, select: { authorId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy ý kiến');
    if (row.authorId !== user.userId) throw new ForbiddenException('Chỉ người ghi ý kiến mới được xóa ý kiến đó');
    await this.prisma.homeroomBookReview.delete({ where: { id } });
  }
}

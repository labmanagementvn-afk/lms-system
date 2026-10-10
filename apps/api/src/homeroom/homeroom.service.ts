import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AbsenceRequestStatus, Direction, HomeroomStatus, NotificationKind, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { summarizeDay } from '../attendance/daily-summary';
import { AuthUser } from '../common/auth-user';
import { localDate, localTime, zonedDayRange } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbsenceService, leaveNote } from './absence.service';
import { dmy, fromDbDate, isValidDate, monthRange, toDbDate } from './dates';
import { HomeroomAccessService, studentSelect } from './homeroom-access.service';
import { AttendanceQuery, AttendanceRecordDto, DailyAttendanceQuery, MonthlyAttendanceQuery, PrefillAttendanceDto, SaveAttendanceDto } from './homeroom.dto';

type School = { id: string; timezone: string; lateAfter: string };
type ClassRef = { id: string; name: string; gradeLevel: number; homeroomTeacherId: string | null };
type Student = { id: string; code: string; fullName: string };
type GateSummary = { status: 'ON_TIME' | 'LATE' | 'ABSENT'; firstIn: Date | null; lastOut: Date | null };

const emptyCounts = () => ({ present: 0, absent: 0, late: 0, excused: 0 });
const countKey = (s: HomeroomStatus) => s.toLowerCase() as 'present' | 'absent' | 'late' | 'excused';

/** Điểm danh đầu giờ: the homeroom teacher's roll call, prefilled from the gate terminals. */
@Injectable()
export class HomeroomService {
  private readonly logger = new Logger(HomeroomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HomeroomAccessService,
    private readonly notifications: NotificationsService,
    private readonly years: AcademicYearsService,
    private readonly absences: AbsenceService,
  ) {}

  /** The roll-call sheet for one class and day, with what the gate terminals saw. */
  async sheet(user: AuthUser, query: AttendanceQuery) {
    const school = await this.school(user.schoolId);
    const date = this.resolveDate(query.date, school);
    const klass = await this.access.getClass(user.schoolId, query.classId);
    await this.access.assertHomeroom(user, klass);
    return this.build(school, klass, date);
  }

  /** Upserts the given records and alerts the parents of students newly marked absent or late. */
  async save(user: AuthUser, dto: SaveAttendanceDto) {
    const school = await this.school(user.schoolId);
    const date = this.resolveDate(dto.date, school, true);
    const klass = await this.access.getClass(user.schoolId, dto.classId);
    await this.access.assertHomeroom(user, klass);
    const roster = await this.access.roster(klass.id);
    const known = new Set(roster.map((s) => s.id));
    if (dto.records.some((r) => !known.has(r.studentId))) throw new BadRequestException('Học sinh không thuộc lớp này');
    // Last record wins when a student is sent twice.
    const records = [...new Map(dto.records.map((r) => [r.studentId, r])).values()];
    await this.upsert(user, school, klass, date, records, roster);
    return this.build(school, klass, date, roster);
  }

  /**
   * Marks every unmarked student from the gate data: on time -> PRESENT, late -> LATE, no event -> ABSENT,
   * or EXCUSED when an approved leave request covers the day.
   */
  async prefill(user: AuthUser, dto: PrefillAttendanceDto) {
    const school = await this.school(user.schoolId);
    const date = this.resolveDate(dto.date, school, true);
    const klass = await this.access.getClass(user.schoolId, dto.classId);
    await this.access.assertHomeroom(user, klass);
    const roster = await this.access.roster(klass.id);
    const [existing, gate, leaves] = await Promise.all([
      this.prisma.homeroomAttendance.findMany({ where: { classId: klass.id, date: toDbDate(date) }, select: { studentId: true } }),
      this.gateSummaries(school, date, roster),
      this.absences.covering(roster.map((s) => s.id), date),
    ]);
    const marked = new Set(existing.map((r) => r.studentId));
    const records: AttendanceRecordDto[] = roster
      .filter((s) => !marked.has(s.id))
      .map((s) => {
        const g = gate.get(s.id)!;
        const leave = leaves.get(s.id);
        if (g.status === 'ABSENT' && leave?.status === AbsenceRequestStatus.APPROVED) return { studentId: s.id, status: HomeroomStatus.EXCUSED, note: leaveNote(leave.reason) };
        if (g.status === 'ABSENT') return { studentId: s.id, status: HomeroomStatus.ABSENT };
        if (g.status === 'LATE') return { studentId: s.id, status: HomeroomStatus.LATE, note: `Vào cổng lúc ${localTime(g.firstIn!, school.timezone)}` };
        return { studentId: s.id, status: HomeroomStatus.PRESENT };
      });
    await this.upsert(user, school, klass, date, records, roster);
    return this.build(school, klass, date, roster, gate, leaves);
  }

  /** Per-student counts and per-day totals for one month. */
  async monthly(user: AuthUser, query: MonthlyAttendanceQuery) {
    let range: { from: Date; to: Date };
    try {
      range = monthRange(query.month);
    } catch {
      throw new BadRequestException('Tháng không hợp lệ');
    }
    const klass = await this.access.getClass(user.schoolId, query.classId);
    await this.access.assertHomeroom(user, klass);
    const [roster, records] = await Promise.all([
      this.access.roster(klass.id),
      this.prisma.homeroomAttendance.findMany({
        where: { classId: klass.id, date: { gte: range.from, lt: range.to } },
        select: { studentId: true, date: true, status: true, note: true },
        orderBy: { date: 'asc' },
      }),
    ]);
    // Students who left the class during the month still show up for the days they were marked.
    const extraIds = [...new Set(records.map((r) => r.studentId))].filter((id) => !roster.some((s) => s.id === id));
    const extra = extraIds.length ? await this.prisma.student.findMany({ where: { id: { in: extraIds } }, select: studentSelect }) : [];
    const students = [...roster, ...extra];

    const perStudent = new Map(students.map((s) => [s.id, { student: s, ...emptyCounts(), total: 0, days: {} as Record<string, { status: HomeroomStatus; note: string | null }> }]));
    const perDay = new Map<string, ReturnType<typeof emptyCounts> & { date: string; total: number }>();
    for (const r of records) {
      const date = fromDbDate(r.date);
      const s = perStudent.get(r.studentId);
      if (s) {
        s[countKey(r.status)]++;
        s.total++;
        s.days[date] = { status: r.status, note: r.note };
      }
      const d = perDay.get(date) ?? { date, ...emptyCounts(), total: 0 };
      d[countKey(r.status)]++;
      d.total++;
      perDay.set(date, d);
    }
    return {
      class: this.classRef(klass),
      month: query.month,
      students: [...perStudent.values()],
      days: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Every class of the current year with how much of its roll call is done, for the school dashboard. */
  async daily(schoolId: string, query: DailyAttendanceQuery) {
    const school = await this.school(schoolId);
    const date = this.resolveDate(query.date, school);
    const year = await this.years.current(schoolId);
    const classes = await this.prisma.class.findMany({
      where: { schoolId, academicYearId: year.id },
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        homeroomTeacher: { select: { id: true, fullName: true } },
        _count: { select: { enrollments: { where: { student: { status: StudentStatus.STUDYING } } } } },
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const grouped = await this.prisma.homeroomAttendance.groupBy({
      by: ['classId', 'status'],
      where: { schoolId, date: toDbDate(date), classId: { in: classes.map((c) => c.id) } },
      _count: { _all: true },
    });
    const rows = classes.map((c) => {
      const counts = emptyCounts();
      for (const g of grouped) if (g.classId === c.id) counts[countKey(g.status)] += g._count._all;
      const marked = counts.present + counts.absent + counts.late + counts.excused;
      return { class: { id: c.id, name: c.name, gradeLevel: c.gradeLevel, homeroomTeacher: c.homeroomTeacher }, total: c._count.enrollments, marked, ...counts };
    });
    const summary = rows.reduce(
      (acc, r) => ({
        classes: acc.classes + 1,
        classesMarked: acc.classesMarked + (r.marked > 0 ? 1 : 0),
        total: acc.total + r.total,
        marked: acc.marked + r.marked,
        present: acc.present + r.present,
        absent: acc.absent + r.absent,
        late: acc.late + r.late,
        excused: acc.excused + r.excused,
      }),
      { classes: 0, classesMarked: 0, total: 0, marked: 0, ...emptyCounts() },
    );
    return { date, rows, summary };
  }

  // ---- internals ----

  private school(id: string): Promise<School> {
    return this.prisma.school.findUniqueOrThrow({ where: { id }, select: { id: true, timezone: true, lateAfter: true } });
  }

  private resolveDate(date: string | undefined, school: School, forbidFuture = false): string {
    const today = localDate(new Date(), school.timezone);
    if (!date) return today;
    if (!isValidDate(date)) throw new BadRequestException('Ngày không hợp lệ');
    if (forbidFuture && date > today) throw new BadRequestException('Không thể điểm danh cho ngày trong tương lai');
    return date;
  }

  private classRef(klass: ClassRef) {
    return { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, homeroomTeacherId: klass.homeroomTeacherId };
  }

  /** What the gate terminals saw for each student that day. */
  private async gateSummaries(school: School, date: string, roster: Student[]): Promise<Map<string, GateSummary>> {
    const { start, end } = zonedDayRange(date, school.timezone);
    const events = await this.prisma.gateEvent.findMany({
      where: { schoolId: school.id, studentId: { in: roster.map((s) => s.id) }, occurredAt: { gte: start, lt: end } },
      select: { studentId: true, occurredAt: true, direction: true },
    });
    const byStudent = new Map<string, { occurredAt: Date; direction: Direction }[]>();
    for (const e of events) byStudent.set(e.studentId!, [...(byStudent.get(e.studentId!) ?? []), e]);
    return new Map(
      roster.map((s) => {
        const { status, firstIn, lastOut } = summarizeDay(byStudent.get(s.id) ?? [], school.lateAfter, school.timezone);
        return [s.id, { status, firstIn, lastOut }];
      }),
    );
  }

  private async build(school: School, klass: ClassRef, date: string, roster?: Student[], gate?: Map<string, GateSummary>, leaves?: Awaited<ReturnType<AbsenceService['covering']>>) {
    roster ??= await this.access.roster(klass.id);
    gate ??= await this.gateSummaries(school, date, roster);
    leaves ??= await this.absences.covering(roster.map((s) => s.id), date);
    const records = await this.prisma.homeroomAttendance.findMany({ where: { classId: klass.id, date: toDbDate(date) } });
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    const rows = roster.map((s) => {
      const r = byStudent.get(s.id);
      // The leave request covering the day, waiting or approved, so the teacher marks it "có phép".
      return { student: s, status: r?.status ?? null, note: r?.note ?? null, updatedAt: r?.updatedAt ?? null, gate: gate!.get(s.id)!, leave: leaves!.get(s.id) ?? null };
    });
    const summary = { total: rows.length, ...emptyCounts(), unmarked: 0 };
    for (const r of rows) {
      if (r.status) summary[countKey(r.status)]++;
      else summary.unmarked++;
    }
    return { class: this.classRef(klass), date, lateAfter: school.lateAfter, timezone: school.timezone, rows, summary };
  }

  private async upsert(user: AuthUser, school: School, klass: ClassRef, date: string, records: AttendanceRecordDto[], roster: Student[]) {
    if (!records.length) return;
    const dbDate = toDbDate(date);
    const before = new Map(
      (await this.prisma.homeroomAttendance.findMany({ where: { classId: klass.id, date: dbDate }, select: { studentId: true, status: true } })).map((r) => [
        r.studentId,
        r.status,
      ]),
    );
    await this.prisma.$transaction(
      records.map((r) =>
        this.prisma.homeroomAttendance.upsert({
          where: { classId_date_studentId: { classId: klass.id, date: dbDate, studentId: r.studentId } },
          create: { schoolId: school.id, classId: klass.id, studentId: r.studentId, date: dbDate, status: r.status, note: r.note ?? null, recordedById: user.userId },
          update: { status: r.status, note: r.note ?? null, recordedById: user.userId },
        }),
      ),
    );
    // Parents hear about absences and late arrivals once per change of status, not on every re-save.
    const changed = records.filter((r) => (r.status === HomeroomStatus.ABSENT || r.status === HomeroomStatus.LATE) && before.get(r.studentId) !== r.status);
    // Parents who asked for the day off already know their child is not in class.
    const absent = changed.filter((r) => r.status === HomeroomStatus.ABSENT).map((r) => r.studentId);
    const onLeave = await this.absences.covering(absent, date);
    const students = new Map(roster.map((s) => [s.id, s]));
    for (const r of changed) {
      if (r.status === HomeroomStatus.ABSENT && onLeave.has(r.studentId)) continue;
      await this.alertGuardians(school.id, klass, date, students.get(r.studentId)!, r);
    }
  }

  private async alertGuardians(schoolId: string, klass: ClassRef, date: string, student: Student, r: AttendanceRecordDto) {
    const [kind, title, verb] =
      r.status === HomeroomStatus.ABSENT
        ? [NotificationKind.HOMEROOM_ABSENT, 'Con vắng mặt tại lớp', 'vắng mặt']
        : [NotificationKind.HOMEROOM_LATE, 'Con đi muộn', 'đi muộn'];
    const body = `${student.fullName} ${verb} buổi học ngày ${dmy(date)}${r.note ? `: ${r.note}` : ''}. Nếu có nhầm lẫn, vui lòng liên hệ giáo viên chủ nhiệm.`;
    try {
      await this.notifications.notifyGuardians(schoolId, student.id, {
        kind,
        title,
        body,
        data: { classId: klass.id, className: klass.name, date, status: r.status, note: r.note ?? null },
      });
    } catch (e) {
      // The roll call is saved already; a failed alert must not fail the request.
      this.logger.error(`homeroom alert failed for ${student.id}: ${(e as Error).message}`);
    }
  }
}

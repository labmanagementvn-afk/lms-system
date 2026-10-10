import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AbsenceRequestStatus, HomeroomStatus, NotificationKind, Prisma, Role, Session, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentAccessService } from '../parents/parent-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbsenceQuery, AbsenceRequestDto, DecideAbsenceDto, RecordAbsenceDto } from './absence.dto';
import { addDays, daysBetween, dmy, fromDbDate, isValidDate, toDbDate } from './dates';
import { HomeroomAccessService } from './homeroom-access.service';

/** Longest leave one request may ask for. */
export const MAX_LEAVE_DAYS = 30;
/** How far back a parent may ask for days already missed; older days go through the homeroom teacher. */
export const PARENT_LOOKBACK_DAYS = 7;

/** The requests that keep a student off the roll call: waiting for the teacher, or approved. */
const OPEN: AbsenceRequestStatus[] = [AbsenceRequestStatus.PENDING, AbsenceRequestStatus.APPROVED];

const SESSION_LABEL: Record<Session, string> = { MORNING: 'buổi sáng', AFTERNOON: 'buổi chiều' };

/** "ngày 12/10/2026", "buổi chiều ngày 12/10/2026" or "từ ngày 12/10/2026 đến ngày 14/10/2026". */
export function leaveDays(r: { fromDate: string; toDate: string; session: Session | null }) {
  const days = r.fromDate === r.toDate ? `ngày ${dmy(r.fromDate)}` : `từ ngày ${dmy(r.fromDate)} đến ngày ${dmy(r.toDate)}`;
  return r.session ? `${SESSION_LABEL[r.session]} ${days}` : days;
}

/** The roll-call note of a day covered by an approved request. */
export const leaveNote = (reason: string) => `Có đơn xin nghỉ: ${reason}`.slice(0, 255);

const include = {
  student: { select: { id: true, code: true, fullName: true } },
  class: { select: { id: true, name: true, homeroomTeacherId: true } },
} satisfies Prisma.AbsenceRequestInclude;
type Row = Prisma.AbsenceRequestGetPayload<{ include: typeof include }>;

/**
 * Đơn xin nghỉ học: parents ask for a child's days off from the app, the homeroom
 * teacher approves or declines; approved days are excused on the roll call
 * (absent days already marked become "có phép", and the gate prefill marks them so).
 */
@Injectable()
export class AbsenceService {
  private readonly logger = new Logger(AbsenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HomeroomAccessService,
    private readonly parents: ParentAccessService,
    private readonly years: AcademicYearsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- the school ----

  /** Requests of the caller's homeroom classes (all classes for the office), waiting ones first. */
  async list(user: AuthUser, q: AbsenceQuery) {
    let classIds: string[] | undefined;
    if (q.classId) {
      const klass = await this.access.getClass(user.schoolId, q.classId);
      await this.access.assertHomeroom(user, klass);
      classIds = [klass.id];
    } else if (user.role === Role.TEACHER) {
      const teacher = await this.access.teacherOf(user);
      const year = await this.years.current(user.schoolId);
      classIds = teacher ? (await this.prisma.class.findMany({ where: { schoolId: user.schoolId, academicYearId: year.id, homeroomTeacherId: teacher.id }, select: { id: true } })).map((c) => c.id) : [];
    }
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const rows = await this.prisma.absenceRequest.findMany({
      where: {
        schoolId: user.schoolId,
        classId: classIds ? { in: classIds } : undefined,
        status: q.status,
        // Requests with a day off in the range.
        toDate: q.from ? { gte: toDbDate(q.from) } : undefined,
        fromDate: q.to ? { lte: toDbDate(q.to) } : undefined,
      },
      include,
      // PENDING sorts first: Postgres orders an enum as it is declared.
      orderBy: [{ status: 'asc' }, { fromDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return this.present(rows);
  }

  /** The homeroom teacher writes down a request made by phone or on paper; it is approved as it is recorded. */
  async record(user: AuthUser, dto: RecordAbsenceDto) {
    const klass = await this.classOfStudent(user.schoolId, dto.studentId);
    await this.access.assertHomeroom(user, klass);
    const today = await this.today(user.schoolId);
    this.checkDays(dto, today, false);
    await this.assertNoOverlap(dto.studentId, dto);
    const row = await this.prisma.absenceRequest.create({
      data: { schoolId: user.schoolId, studentId: dto.studentId, classId: klass.id, fromDate: toDbDate(dto.fromDate), toDate: toDbDate(dto.toDate), session: dto.session ?? null, reason: dto.reason.trim(), status: AbsenceRequestStatus.APPROVED, requestedById: user.userId, decidedById: user.userId, decidedAt: new Date() },
      include,
    });
    const excused = await this.excuse(row, today);
    await this.tellParents(user.schoolId, row, `Nhà trường đã ghi nhận đơn xin nghỉ học của ${row.student.fullName} ${leaveDays(this.days(row))}.`);
    return { ...(await this.present([row]))[0], excused };
  }

  /** Approves or declines a waiting request; approving excuses the days already marked absent. */
  async decide(user: AuthUser, id: string, dto: DecideAbsenceDto) {
    const row = await this.prisma.absenceRequest.findFirst({ where: { id, schoolId: user.schoolId }, include });
    if (!row) throw new NotFoundException('Không tìm thấy đơn xin nghỉ');
    await this.access.assertHomeroom(user, row.class);
    if (row.status !== AbsenceRequestStatus.PENDING) throw new BadRequestException('Đơn này đã được xử lý');
    const status = dto.approve ? AbsenceRequestStatus.APPROVED : AbsenceRequestStatus.REJECTED;
    // Only a request still waiting is decided, so two teachers deciding at once cannot both win.
    const { count } = await this.prisma.absenceRequest.updateMany({
      where: { id, status: AbsenceRequestStatus.PENDING },
      data: { status, decidedById: user.userId, decidedAt: new Date(), decisionNote: dto.note?.trim() || null },
    });
    if (!count) throw new BadRequestException('Đơn này đã được xử lý');
    const saved = await this.prisma.absenceRequest.findUniqueOrThrow({ where: { id }, include });
    const excused = dto.approve ? await this.excuse(saved, await this.today(user.schoolId)) : 0;
    const verdict = dto.approve ? 'đã được giáo viên chủ nhiệm duyệt' : 'không được duyệt';
    await this.tellParents(user.schoolId, saved, `Đơn xin nghỉ học của ${saved.student.fullName} ${leaveDays(this.days(saved))} ${verdict}.${saved.decisionNote ? ` Ghi chú: ${saved.decisionNote}` : ''}`);
    return { ...(await this.present([saved]))[0], excused };
  }

  // ---- the parent app ----

  async forChild(user: AuthUser, studentId: string) {
    const student = await this.parents.assertChild(user, studentId);
    const rows = await this.prisma.absenceRequest.findMany({ where: { studentId }, include, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], take: 50 });
    return { student, requests: await this.present(rows) };
  }

  /** A parent asks for days off; the homeroom teacher is told. */
  async request(user: AuthUser, studentId: string, dto: AbsenceRequestDto) {
    const student = await this.parents.assertChild(user, studentId);
    const klass = await this.classOfStudent(user.schoolId, studentId);
    const today = await this.today(user.schoolId);
    this.checkDays(dto, today, true);
    await this.assertNoOverlap(studentId, dto);
    const row = await this.prisma.absenceRequest.create({
      data: { schoolId: user.schoolId, studentId, classId: klass.id, fromDate: toDbDate(dto.fromDate), toDate: toDbDate(dto.toDate), session: dto.session ?? null, reason: dto.reason.trim(), requestedById: user.userId },
      include,
    });
    const teacher = klass.homeroomTeacherId ? await this.prisma.teacher.findUnique({ where: { id: klass.homeroomTeacherId }, select: { userId: true } }) : null;
    if (teacher?.userId) {
      const parent = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { fullName: true } });
      try {
        await this.notifications.notifyUsers(user.schoolId, [teacher.userId], {
          kind: NotificationKind.ABSENCE_REQUEST,
          title: `Đơn xin nghỉ học lớp ${klass.name}`,
          body: `Phụ huynh ${parent?.fullName ?? ''} xin cho ${student.fullName} nghỉ học ${leaveDays(this.days(row))}. Lý do: ${row.reason}`,
          data: { requestId: row.id, studentId, classId: klass.id },
          studentId,
        });
      } catch (e) {
        // The request is saved already; a failed alert must not fail it.
        this.logger.error(`leave request alert failed for ${row.id}: ${(e as Error).message}`);
      }
    }
    return (await this.present([row]))[0];
  }

  /** A parent withdraws a request the teacher has not decided yet. */
  async cancel(user: AuthUser, id: string) {
    const row = await this.prisma.absenceRequest.findFirst({ where: { id, schoolId: user.schoolId, student: { guardians: { some: { userId: user.userId } } } }, select: { status: true } });
    if (!row) throw new NotFoundException('Không tìm thấy đơn xin nghỉ');
    const { count } = await this.prisma.absenceRequest.updateMany({ where: { id, status: AbsenceRequestStatus.PENDING }, data: { status: AbsenceRequestStatus.CANCELLED } });
    if (!count) throw new BadRequestException('Chỉ rút được đơn đang chờ duyệt');
    return { id, status: AbsenceRequestStatus.CANCELLED };
  }

  // ---- the roll call ----

  /** Each student's waiting or approved request covering the day, the latest first. */
  async covering(studentIds: string[], date: string) {
    if (!studentIds.length) return new Map<string, { id: string; status: AbsenceRequestStatus; session: Session | null; reason: string; fromDate: string; toDate: string }>();
    const day = toDbDate(date);
    const rows = await this.prisma.absenceRequest.findMany({
      where: { studentId: { in: studentIds }, status: { in: OPEN }, fromDate: { lte: day }, toDate: { gte: day } },
      select: { id: true, studentId: true, status: true, session: true, reason: true, fromDate: true, toDate: true },
      orderBy: { createdAt: 'desc' },
    });
    const out = new Map<string, { id: string; status: AbsenceRequestStatus; session: Session | null; reason: string; fromDate: string; toDate: string }>();
    for (const { studentId, ...r } of rows) {
      // An approved request outranks one still waiting for the same day.
      const seen = out.get(studentId);
      if (!seen || (seen.status !== AbsenceRequestStatus.APPROVED && r.status === AbsenceRequestStatus.APPROVED)) out.set(studentId, { ...r, fromDate: fromDbDate(r.fromDate), toDate: fromDbDate(r.toDate) });
    }
    return out;
  }

  // ---- internals ----

  /** Days up to today already marked absent become excused; later days are excused when the roll call is taken. */
  private async excuse(row: Row, today: string) {
    const from = fromDbDate(row.fromDate);
    const to = fromDbDate(row.toDate) < today ? fromDbDate(row.toDate) : today;
    if (from > to) return 0;
    const { count } = await this.prisma.homeroomAttendance.updateMany({
      where: { studentId: row.studentId, date: { gte: toDbDate(from), lte: toDbDate(to) }, status: HomeroomStatus.ABSENT },
      data: { status: HomeroomStatus.EXCUSED, note: leaveNote(row.reason) },
    });
    return count;
  }

  private checkDays(dto: AbsenceRequestDto, today: string, byParent: boolean) {
    if (!isValidDate(dto.fromDate) || !isValidDate(dto.toDate)) throw new BadRequestException('Ngày không hợp lệ');
    if (dto.fromDate > dto.toDate) throw new BadRequestException('Ngày bắt đầu nghỉ phải trước ngày kết thúc');
    if (daysBetween(dto.fromDate, dto.toDate) + 1 > MAX_LEAVE_DAYS) throw new BadRequestException(`Mỗi đơn xin nghỉ tối đa ${MAX_LEAVE_DAYS} ngày`);
    const earliest = addDays(today, -PARENT_LOOKBACK_DAYS);
    if (byParent && dto.fromDate < earliest) throw new BadRequestException(`Chỉ gửi đơn cho ngày nghỉ từ ${dmy(earliest)}; ngày nghỉ trước đó vui lòng liên hệ giáo viên chủ nhiệm`);
  }

  /** One open request per day and session. */
  private async assertNoOverlap(studentId: string, dto: AbsenceRequestDto) {
    const clash = await this.prisma.absenceRequest.findFirst({
      where: {
        studentId,
        status: { in: OPEN },
        fromDate: { lte: toDbDate(dto.toDate) },
        toDate: { gte: toDbDate(dto.fromDate) },
        // A morning and an afternoon request do not overlap; a whole-day one overlaps both.
        ...(dto.session ? { OR: [{ session: null }, { session: dto.session }] } : {}),
      },
      select: { fromDate: true, toDate: true, session: true },
    });
    if (clash) throw new BadRequestException(`Đã có đơn xin nghỉ ${leaveDays({ fromDate: fromDbDate(clash.fromDate), toDate: fromDbDate(clash.toDate), session: clash.session })}`);
  }

  /** The student's class of the current school year. */
  private async classOfStudent(schoolId: string, studentId: string) {
    const year = await this.years.current(schoolId);
    const row = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: year.id, student: { schoolId } },
      select: { student: { select: { status: true } }, class: { select: { id: true, name: true, homeroomTeacherId: true } } },
    });
    if (!row) throw new NotFoundException(`Học sinh chưa được xếp lớp năm học ${year.name}`);
    if (row.student.status !== StudentStatus.STUDYING) throw new BadRequestException('Học sinh không còn đang học');
    return row.class;
  }

  private async today(schoolId: string) {
    const { timezone } = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return localDate(new Date(), timezone);
  }

  private days(r: { fromDate: Date; toDate: Date; session: Session | null }) {
    return { fromDate: fromDbDate(r.fromDate), toDate: fromDbDate(r.toDate), session: r.session };
  }

  private async tellParents(schoolId: string, row: Row, body: string) {
    try {
      await this.notifications.notifyGuardians(schoolId, row.studentId, {
        kind: NotificationKind.ABSENCE_DECIDED,
        title: 'Đơn xin nghỉ học',
        body,
        data: { requestId: row.id, studentId: row.studentId, classId: row.classId, status: row.status },
      });
    } catch (e) {
      // The decision is saved already; a failed alert must not fail the request.
      this.logger.error(`leave decision alert failed for ${row.id}: ${(e as Error).message}`);
    }
  }

  /** Dates as YYYY-MM-DD and the names of who asked and who decided. */
  private async present(rows: Row[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.requestedById, ...(r.decidedById ? [r.decidedById] : [])]))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true } });
    const who = new Map(users.map((u) => [u.id, { id: u.id, fullName: u.fullName, role: u.role }]));
    return rows.map((r) => ({
      ...r,
      fromDate: fromDbDate(r.fromDate),
      toDate: fromDbDate(r.toDate),
      requestedBy: who.get(r.requestedById) ?? null,
      decidedBy: r.decidedById ? (who.get(r.decidedById) ?? null) : null,
    }));
  }
}

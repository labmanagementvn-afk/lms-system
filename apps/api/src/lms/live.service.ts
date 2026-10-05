import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LiveStatus, NotificationKind, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { localDate, zonedDayRange } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { canJoin, compareSessions, joinUrl, makeRoomName } from './live';
import { LmsAccessService, studentRef, studentSelect } from './lms-access.service';
import { CreateLiveDto, LiveQuery } from './lms.dto';

const sessionInclude = {
  course: { select: { id: true, title: true } },
  _count: { select: { attendances: true } },
} satisfies Prisma.LiveSessionInclude;

type SessionRow = Prisma.LiveSessionGetPayload<{ include: typeof sessionInclude }>;

const withUrl = ({ _count, ...s }: SessionRow) => ({ ...s, attendanceCount: _count.attendances, joinUrl: joinUrl(s.roomName) });

/** Scheduled Jitsi rooms per course and who showed up. */
@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LmsAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(schoolId: string, query: LiveQuery) {
    const rows = await this.prisma.liveSession.findMany({
      where: {
        schoolId,
        courseId: query.courseId,
        startsAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      },
      include: sessionInclude,
    });
    return rows.sort(compareSessions).map(withUrl);
  }

  async create(user: AuthUser, dto: CreateLiveDto) {
    const schoolId = user.schoolId;
    const course = await this.access.course(schoolId, dto.courseId);
    const school = await this.access.school(schoolId);
    const s = await this.prisma.liveSession.create({
      data: {
        schoolId,
        courseId: course.id,
        title: dto.title.trim(),
        startsAt: new Date(dto.startsAt),
        durationMin: dto.durationMin ?? 45,
        roomName: makeRoomName(school.code),
        createdById: user.userId,
      },
      include: sessionInclude,
    });
    return withUrl(s);
  }

  async get(schoolId: string, id: string) {
    const s = await this.prisma.liveSession.findFirst({
      where: { id, schoolId },
      include: { ...sessionInclude, attendances: { include: { student: { select: studentSelect } }, orderBy: { joinedAt: 'asc' } } },
    });
    if (!s) throw new NotFoundException('Không tìm thấy lớp học trực tuyến');
    const { attendances, ...rest } = s;
    return { ...withUrl(rest), attendances: attendances.map((a) => ({ id: a.id, joinedAt: a.joinedAt, leftAt: a.leftAt, student: studentRef(a.student) })) };
  }

  /** Opens the room and tells every enrolled student. */
  async start(schoolId: string, id: string) {
    const s = await this.session(schoolId, id);
    if (s.status !== LiveStatus.SCHEDULED) throw new BadRequestException('Chỉ bắt đầu được lớp đã lên lịch');
    await this.prisma.liveSession.update({ where: { id }, data: { status: LiveStatus.LIVE, startedAt: new Date() } });
    try {
      const enrolled = await this.prisma.courseEnrollment.findMany({ where: { courseId: s.courseId }, select: { student: { select: { userId: true } } } });
      await this.notifications.notifyUsers(
        schoolId,
        enrolled.map((e) => e.student.userId).filter((u): u is string => !!u),
        { kind: NotificationKind.LIVE_CLASS, title: 'Lớp học trực tuyến', body: `${s.title} đang bắt đầu, vào lớp ngay`, data: { liveSessionId: id, courseId: s.courseId } },
      );
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo lớp trực tuyến ${id}: ${e}`);
    }
    return this.get(schoolId, id);
  }

  async end(schoolId: string, id: string) {
    const s = await this.session(schoolId, id);
    if (s.status !== LiveStatus.LIVE) throw new BadRequestException('Lớp chưa bắt đầu');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.liveSession.update({ where: { id }, data: { status: LiveStatus.ENDED, endedAt: now } }),
      this.prisma.liveAttendance.updateMany({ where: { sessionId: id, leftAt: null }, data: { leftAt: now } }),
    ]);
    return this.get(schoolId, id);
  }

  async cancel(schoolId: string, id: string) {
    const s = await this.session(schoolId, id);
    if (s.status !== LiveStatus.SCHEDULED) throw new BadRequestException('Chỉ hủy được lớp chưa diễn ra');
    await this.prisma.liveSession.update({ where: { id }, data: { status: LiveStatus.CANCELLED } });
    return this.get(schoolId, id);
  }

  async remove(schoolId: string, id: string) {
    const s = await this.session(schoolId, id);
    if (s.status !== LiveStatus.SCHEDULED && s.status !== LiveStatus.CANCELLED) throw new BadRequestException('Không xóa được lớp đã diễn ra');
    await this.prisma.liveSession.delete({ where: { id } });
    return { ok: true };
  }

  // ---- student side ----

  /** Sessions of the student's courses from yesterday on (plus anything still running). */
  async forStudent(schoolId: string, studentId: string, courseId?: string) {
    const school = await this.access.school(schoolId);
    const yesterday = localDate(new Date(Date.now() - 86_400_000), school.timezone);
    const since = zonedDayRange(yesterday, school.timezone).start;
    const rows = await this.prisma.liveSession.findMany({
      where: {
        schoolId,
        courseId,
        course: { enrollments: { some: { studentId } } },
        OR: [{ startsAt: { gte: since } }, { status: LiveStatus.LIVE }],
      },
      include: sessionInclude,
    });
    const mine = await this.prisma.liveAttendance.findMany({ where: { studentId, sessionId: { in: rows.map((r) => r.id) } }, select: { sessionId: true } });
    const joined = new Set(mine.map((a) => a.sessionId));
    return rows.sort(compareSessions).map((r) => ({ ...withUrl(r), joined: joined.has(r.id), canJoin: canJoin(r) }));
  }

  /** Records the student in the room (first join only) and hands back the room link. */
  async join(schoolId: string, studentId: string, id: string) {
    const s = await this.session(schoolId, id);
    const enrolled = await this.prisma.courseEnrollment.findUnique({ where: { courseId_studentId: { courseId: s.courseId, studentId } }, select: { id: true } });
    if (!enrolled) throw new NotFoundException('Không tìm thấy lớp học trực tuyến');
    if (!canJoin(s)) throw new BadRequestException(s.status === LiveStatus.SCHEDULED ? 'Lớp chưa mở, hãy quay lại trước giờ học 15 phút' : 'Lớp học đã kết thúc');
    await this.prisma.liveAttendance.upsert({ where: { sessionId_studentId: { sessionId: id, studentId } }, create: { sessionId: id, studentId }, update: {} });
    return { joinUrl: joinUrl(s.roomName) };
  }

  private async session(schoolId: string, id: string) {
    const s = await this.prisma.liveSession.findFirst({ where: { id, schoolId } });
    if (!s) throw new NotFoundException('Không tìm thấy lớp học trực tuyến');
    return s;
  }
}

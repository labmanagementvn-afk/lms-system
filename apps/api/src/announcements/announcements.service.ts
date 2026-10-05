import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Announcement, AnnouncementStatus, NotificationChannel, NotificationKind, Prisma, Role, RsvpResponse } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs, PageQuery } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementQuery, CreateAnnouncementDto, UpdateAnnouncementDto } from './announcements.dto';
import { Audience, isEmptyAudience, parseAudience, recipientWhere, summarizeRecipients, teacherAudienceError } from './audience';

const userSelect = { select: { id: true, fullName: true, role: true } };

export type RsvpCounts = Record<RsvpResponse, number>;
const emptyRsvp = (): RsvpCounts => ({ GOING: 0, NOT_GOING: 0, MAYBE: 0 });

const format = (a: Announcement) => ({ ...a, audience: parseAudience(a.audience) });

/**
 * Thông báo & sự kiện: campaigns sent to an audience of roles, classes or grades.
 * Sending fans the announcement out as notifications; RSVPs come back from the recipients.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly years: AcademicYearsService,
  ) {}

  // ---- Management (school office; teachers see only what they wrote) ----

  async list(user: AuthUser, query: AnnouncementQuery): Promise<Page<unknown>> {
    const where: Prisma.AnnouncementWhereInput = { ...this.scope(user), status: query.status, kind: query.kind };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.announcement.count({ where }),
    ]);
    const ids = items.map((a) => a.id);
    const [reads, rsvps] = ids.length
      ? await Promise.all([
          this.prisma.notification.groupBy({ by: ['announcementId'], where: { announcementId: { in: ids }, readAt: { not: null } }, _count: { _all: true } }),
          this.prisma.announcementResponse.groupBy({ by: ['announcementId', 'response'], where: { announcementId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];
    const readCount = new Map(reads.map((r) => [r.announcementId, r._count._all]));
    const rsvpCounts = new Map<string, RsvpCounts>();
    for (const r of rsvps) {
      const c = rsvpCounts.get(r.announcementId) ?? emptyRsvp();
      c[r.response] += r._count._all;
      rsvpCounts.set(r.announcementId, c);
    }
    return {
      items: items.map((a) => ({ ...format(a), readCount: readCount.get(a.id) ?? 0, rsvpCounts: rsvpCounts.get(a.id) ?? emptyRsvp() })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(user: AuthUser, id: string) {
    const a = await this.find(user, id);
    const [readCount, responses] = await Promise.all([
      this.prisma.notification.count({ where: { announcementId: id, readAt: { not: null } } }),
      this.prisma.announcementResponse.findMany({ where: { announcementId: id }, include: { user: userSelect }, orderBy: { respondedAt: 'desc' } }),
    ]);
    const rsvpCounts = emptyRsvp();
    for (const r of responses) rsvpCounts[r.response]++;
    return { ...format(a), readCount, rsvpCounts, responses };
  }

  async create(user: AuthUser, dto: CreateAnnouncementDto) {
    const audience = parseAudience(dto.audience);
    await this.assertAudience(user, audience);
    const eventAt = dto.eventAt ? new Date(dto.eventAt) : null;
    this.assertEvent(dto.kind, eventAt);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const a = await this.prisma.announcement.create({
      data: {
        schoolId: user.schoolId,
        kind: dto.kind,
        title: dto.title.trim(),
        body: dto.body,
        eventAt,
        location: dto.location?.trim() || null,
        rsvp: !!dto.rsvp,
        audience: audience as unknown as Prisma.InputJsonValue,
        channels: this.channels(dto.channels),
        scheduledAt,
        status: scheduledAt ? AnnouncementStatus.SCHEDULED : AnnouncementStatus.DRAFT,
        createdById: user.userId,
      },
    });
    return format(a);
  }

  async update(user: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const a = await this.find(user, id);
    this.assertEditable(a, 'sửa');
    const audience = dto.audience ? parseAudience(dto.audience) : parseAudience(a.audience);
    if (dto.audience || user.role === Role.TEACHER) await this.assertAudience(user, audience);
    const kind = dto.kind ?? a.kind;
    // PartialType makes every field optional; null clears an optional value.
    const eventAt = dto.eventAt === undefined ? a.eventAt : dto.eventAt ? new Date(dto.eventAt) : null;
    this.assertEvent(kind, eventAt);
    const scheduledAt = dto.scheduledAt === undefined ? a.scheduledAt : dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        kind,
        title: dto.title?.trim(),
        body: dto.body,
        eventAt,
        location: dto.location === undefined ? undefined : dto.location?.trim() || null,
        rsvp: dto.rsvp,
        audience: audience as unknown as Prisma.InputJsonValue,
        channels: dto.channels ? this.channels(dto.channels) : undefined,
        scheduledAt,
        status: scheduledAt ? AnnouncementStatus.SCHEDULED : AnnouncementStatus.DRAFT,
      },
    });
    return format(updated);
  }

  async remove(user: AuthUser, id: string) {
    const a = await this.find(user, id);
    this.assertEditable(a, 'xóa');
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  /** Who would receive it right now, without sending. */
  async preview(user: AuthUser, id: string) {
    const a = await this.find(user, id);
    const { users, byRole } = await this.recipients(a);
    return { recipients: users.length, byRole };
  }

  async send(user: AuthUser, id: string) {
    const a = await this.find(user, id);
    if (a.status === AnnouncementStatus.SENT) throw new BadRequestException('Thông báo đã được gửi');
    if (user.role === Role.TEACHER) await this.assertAudience(user, parseAudience(a.audience));
    return this.deliver(a);
  }

  /** Sends every scheduled announcement whose time has come (one school, or all of them for the timer). */
  async runScheduled(schoolId?: string) {
    const due = await this.prisma.announcement.findMany({
      where: { schoolId, status: AnnouncementStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
    });
    let sent = 0;
    for (const a of due) {
      try {
        await this.deliver(a);
        sent++;
      } catch (e) {
        this.logger.error(`scheduled announcement ${a.id} failed: ${(e as Error).message}`);
      }
    }
    return { sent };
  }

  // ---- Recipients (every role) ----

  /** SENT announcements the caller received, newest first, with their own RSVP. */
  async mine(user: AuthUser, query: PageQuery): Promise<Page<unknown>> {
    const where: Prisma.AnnouncementWhereInput = { schoolId: user.schoolId, status: AnnouncementStatus.SENT, notifications: { some: { userId: user.userId } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include: {
          responses: { where: { userId: user.userId }, select: { response: true, respondedAt: true } },
          notifications: { where: { userId: user.userId }, select: { id: true, readAt: true }, take: 1 },
        },
        orderBy: { sentAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return {
      items: items.map(({ responses, notifications, audience: _audience, ...a }) => ({
        ...a,
        myResponse: responses[0]?.response ?? null,
        respondedAt: responses[0]?.respondedAt ?? null,
        notificationId: notifications[0]?.id ?? null,
        readAt: notifications[0]?.readAt ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async rsvp(user: AuthUser, id: string, response: RsvpResponse) {
    const a = await this.prisma.announcement.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Không tìm thấy thông báo');
    if (a.status !== AnnouncementStatus.SENT || !a.rsvp) throw new BadRequestException('Thông báo này không nhận xác nhận tham dự');
    const received = await this.prisma.notification.findFirst({ where: { announcementId: id, userId: user.userId }, select: { id: true } });
    if (!received) throw new ForbiddenException('Bạn không nằm trong danh sách nhận thông báo này');
    const r = await this.prisma.announcementResponse.upsert({
      where: { announcementId_userId: { announcementId: id, userId: user.userId } },
      create: { announcementId: id, userId: user.userId, response },
      update: { response, respondedAt: new Date() },
    });
    return { response: r.response, respondedAt: r.respondedAt };
  }

  async myRsvp(user: AuthUser, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, schoolId: user.schoolId }, select: { id: true } });
    if (!a) throw new NotFoundException('Không tìm thấy thông báo');
    const r = await this.prisma.announcementResponse.findUnique({ where: { announcementId_userId: { announcementId: id, userId: user.userId } } });
    return { response: r?.response ?? null, respondedAt: r?.respondedAt ?? null };
  }

  // ---- internals ----

  /** Teachers only see the announcements they wrote themselves. */
  private scope(user: AuthUser): Prisma.AnnouncementWhereInput {
    return { schoolId: user.schoolId, ...(user.role === Role.TEACHER ? { createdById: user.userId } : {}) };
  }

  private async find(user: AuthUser, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, ...this.scope(user) } });
    if (!a) throw new NotFoundException('Không tìm thấy thông báo');
    return a;
  }

  private assertEditable(a: Announcement, action: string) {
    if (a.status === AnnouncementStatus.SENT) throw new BadRequestException(`Thông báo đã gửi, không thể ${action}`);
  }

  private assertEvent(kind: NotificationKind, eventAt: Date | null) {
    if (kind === NotificationKind.EVENT && !eventAt) throw new BadRequestException('Sự kiện cần có thời gian diễn ra');
  }

  private channels(list?: NotificationChannel[]) {
    return [...new Set([NotificationChannel.IN_APP, ...(list ?? [])])];
  }

  private async assertAudience(user: AuthUser, audience: Audience) {
    if (isEmptyAudience(audience)) throw new BadRequestException('Chọn đối tượng nhận thông báo');
    if (audience.classIds.length) {
      const n = await this.prisma.class.count({ where: { id: { in: audience.classIds }, schoolId: user.schoolId } });
      if (n !== audience.classIds.length) throw new BadRequestException('Lớp không hợp lệ');
    }
    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.userId }, select: { homeroomClasses: { select: { id: true } } } });
      const error = teacherAudienceError(audience, teacher?.homeroomClasses.map((c) => c.id) ?? []);
      if (error) throw new ForbiddenException(error);
    }
  }

  private async recipients(a: Announcement) {
    const audience = parseAudience(a.audience);
    // Grade levels are resolved against the current year's classes; class ids need no year.
    const academicYearId = audience.gradeLevels.length ? (await this.years.current(a.schoolId)).id : '';
    const where = recipientWhere(a.schoolId, academicYearId, audience);
    const users = where ? await this.prisma.user.findMany({ where, select: { id: true, role: true } }) : [];
    return summarizeRecipients(users);
  }

  /** Flips the status first so that a concurrent send (timer + button) delivers only once. */
  private async deliver(a: Announcement) {
    const claimed = await this.prisma.announcement.updateMany({
      where: { id: a.id, status: { not: AnnouncementStatus.SENT } },
      data: { status: AnnouncementStatus.SENT, sentAt: new Date() },
    });
    if (!claimed.count) throw new BadRequestException('Thông báo đã được gửi');
    const { users } = await this.recipients(a);
    const recipients = await this.notifications.notifyUsers(
      a.schoolId,
      users.map((u) => u.id),
      {
        kind: a.kind,
        title: a.title,
        body: a.body,
        announcementId: a.id,
        channels: a.channels,
        data: { eventAt: a.eventAt?.toISOString() ?? null, location: a.location, rsvp: a.rsvp },
      },
    );
    const updated = await this.prisma.announcement.update({ where: { id: a.id }, data: { recipients } });
    return format(updated);
  }
}

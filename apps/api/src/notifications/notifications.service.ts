import { Injectable, MessageEvent } from '@nestjs/common';
import { Notification, NotificationChannel, NotificationKind, Prisma, Role } from '@prisma/client';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQuery } from './notifications.dto';

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  studentId?: string;
  announcementId?: string;
  /** Overrides the school's enabled channels (still filtered by them). */
  channels?: NotificationChannel[];
}

const KEEPALIVE_MS = 25_000;

/**
 * Creates in-app notifications and queues their deliveries on the other enabled
 * channels. Other modules call notifyGuardians / notifyUsers; the dispatcher
 * pushes the queued deliveries out.
 */
@Injectable()
export class NotificationsService {
  private readonly streams = new Map<string, Subject<Notification>>();

  constructor(private readonly prisma: PrismaService) {}

  async enabledChannels(schoolId: string): Promise<NotificationChannel[]> {
    const s = await this.prisma.notificationSettings.findUnique({ where: { schoolId } });
    return s?.channels ?? [NotificationChannel.IN_APP];
  }

  async notifyUsers(schoolId: string, userIds: string[], input: NotifyInput): Promise<number> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return 0;
    const enabled = await this.enabledChannels(schoolId);
    const channels = (input.channels ?? enabled).filter((c) => c !== NotificationChannel.IN_APP && enabled.includes(c));
    const rows = await this.prisma.notification.createManyAndReturn({
      data: ids.map((userId) => ({
        schoolId,
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue | undefined,
        studentId: input.studentId,
        announcementId: input.announcementId,
      })),
    });
    if (channels.length) {
      await this.prisma.notificationDelivery.createMany({
        data: rows.flatMap((n) => channels.map((channel) => ({ notificationId: n.id, channel }))),
      });
    }
    for (const n of rows) this.streams.get(n.userId)?.next(n);
    return rows.length;
  }

  /** Notifies every parent account linked to the student. */
  async notifyGuardians(schoolId: string, studentId: string, input: NotifyInput): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { schoolId, role: Role.PARENT, isActive: true, guardians: { some: { studentId } } },
      select: { id: true },
    });
    return this.notifyUsers(schoolId, users.map((u) => u.id), { ...input, studentId });
  }

  async notifyRoles(schoolId: string, roles: Role[], input: NotifyInput): Promise<number> {
    const users = await this.prisma.user.findMany({ where: { schoolId, role: { in: roles }, isActive: true }, select: { id: true } });
    return this.notifyUsers(schoolId, users.map((u) => u.id), input);
  }

  /** Live feed for one user; a keepalive comment every 25 s keeps proxies from closing it. */
  stream(userId: string): Observable<MessageEvent> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<Notification>();
      this.streams.set(userId, subject);
    }
    const events = subject.pipe(map((n) => ({ type: 'notification', data: n }) as MessageEvent));
    const keepalive = interval(KEEPALIVE_MS).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent));
    return merge(events, keepalive);
  }

  async list(userId: string, query: NotificationQuery): Promise<Page<unknown>> {
    const where: Prisma.NotificationWhereInput = { userId, kind: query.kind, readAt: query.unread ? null : undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: {
          student: { select: { id: true, code: true, fullName: true } },
          announcement: { select: { id: true, kind: true, eventAt: true, location: true, rsvp: true, responses: { where: { userId }, select: { response: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async unreadCount(userId: string) {
    return { unread: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return this.unreadCount(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return this.unreadCount(userId);
  }

  async settings(schoolId: string) {
    return { channels: await this.enabledChannels(schoolId) };
  }

  async updateSettings(schoolId: string, channels: NotificationChannel[]) {
    const list = [...new Set([NotificationChannel.IN_APP, ...channels])];
    await this.prisma.notificationSettings.upsert({ where: { schoolId }, create: { schoolId, channels: list }, update: { channels: list } });
    return { channels: list };
  }

  async registerPushToken(userId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({ where: { token }, create: { userId, token, platform }, update: { userId, platform } });
    return { ok: true };
  }
}

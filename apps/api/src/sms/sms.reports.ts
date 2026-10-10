import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { Role, SyncStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { zonedDayRange } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { slug, table, text } from '../reports/document';
import { ReportsService, STT } from '../reports/reports.service';
import { ReportQuery } from '../reports/reports.dto';

const dmy = (date: string) => date.split('-').reverse().join('/');

/** "Thống kê tin nhắn SMS": texts and SMS sent per class over a period, for the office. */
@Injectable()
export class SmsReports implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.reports.register({ key: 'sms-usage', group: 'Liên lạc', name: 'Thống kê tin nhắn SMS', params: ['from', 'to'], required: ['from', 'to'], roles: [Role.ADMIN, Role.STAFF], build: (u, q) => this.usage(u, q) });
  }

  private async usage(user: AuthUser, q: ReportQuery) {
    if (q.from! > q.to!) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const { timezone } = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { timezone: true } });
    const start = zonedDayRange(q.from!, timezone).start;
    const end = zonedDayRange(q.to!, timezone).end;
    const groups = await this.prisma.smsMessage.groupBy({
      by: ['classId', 'status'],
      where: { schoolId: user.schoolId, campaign: { scheduledAt: { gte: start, lt: end } } },
      _count: { _all: true },
      _sum: { segments: true },
    });
    const classes = await this.prisma.class.findMany({
      where: { id: { in: groups.flatMap((g) => (g.classId ? [g.classId] : [])) } },
      select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { fullName: true } } },
    });
    classes.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true }));
    type Row = { texts: number; sent: number; failed: number; pending: number; segments: number };
    const empty = (): Row => ({ texts: 0, sent: 0, failed: 0, pending: 0, segments: 0 });
    const byClass = new Map<string | null, Row>();
    for (const g of groups) {
      const r = byClass.get(g.classId) ?? empty();
      r.texts += g._count._all;
      if (g.status === SyncStatus.SUCCESS) r.sent += g._count._all;
      else if (g.status === SyncStatus.FAILED) r.failed += g._count._all;
      else r.pending += g._count._all;
      // Failed texts are not billed.
      if (g.status !== SyncStatus.FAILED) r.segments += g._sum.segments ?? 0;
      byClass.set(g.classId, r);
    }
    const lines = [
      ...classes.map((c) => ({ name: `Lớp ${c.name}`, teacher: c.homeroomTeacher?.fullName ?? '', ...(byClass.get(c.id) ?? empty()) })),
      ...(byClass.has(null) ? [{ name: 'Tin nhắn gửi giáo viên', teacher: '', ...byClass.get(null)! }] : []),
    ];
    const total = lines.reduce((t, l) => ({ texts: t.texts + l.texts, sent: t.sent + l.sent, failed: t.failed + l.failed, pending: t.pending + l.pending, segments: t.segments + l.segments }), empty());
    return {
      fileName: slug(`thong-ke-tin-nhan-sms-${q.from}-${q.to}`),
      title: 'Thống kê tin nhắn SMS',
      subtitles: [`Từ ngày ${dmy(q.from!)} đến ngày ${dmy(q.to!)}`],
      blocks: [
        table(
          [
            STT,
            { header: 'Đối tượng', width: 1.8 },
            { header: 'Giáo viên chủ nhiệm', width: 2.2 },
            { header: 'Số tin', width: 0.8, align: 'center' },
            { header: 'Thành công', width: 0.9, align: 'center', group: 'Trạng thái' },
            { header: 'Lỗi', width: 0.7, align: 'center', group: 'Trạng thái' },
            { header: 'Đang chờ', width: 0.9, align: 'center', group: 'Trạng thái' },
            { header: 'Số SMS tính cước', width: 1.1, align: 'center' },
          ],
          [
            ...lines.map((l, i) => [i + 1, l.name, l.teacher, l.texts, l.sent, l.failed, l.pending, l.segments]),
            ['', 'Tổng cộng', '', total.texts, total.sent, total.failed, total.pending, total.segments],
          ],
        ),
        text(['Mỗi SMS gồm 160 ký tự không dấu, hoặc 70 ký tự có dấu; tin dài hơn tính thành nhiều SMS. Tin lỗi không tính cước.'], { italic: true }),
      ],
    };
  }
}

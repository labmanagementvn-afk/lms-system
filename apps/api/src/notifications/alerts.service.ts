import { Injectable, Logger } from '@nestjs/common';
import { Direction, NotificationKind } from '@prisma/client';
import { localDate, localTime } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

export const vnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;
/** "2026-10-05" -> "05/10/2026" */
export const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

const SEVERITY: Record<string, string> = { MINOR: 'nhẹ', MODERATE: 'trung bình', SERIOUS: 'nghiêm trọng' };

/**
 * The messages parents get from the school's day-to-day records. Every method
 * swallows its own errors: an alert must never fail the gate ingest, a payment
 * or a nurse's note that triggered it.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async gateEvents(schoolId: string, events: { studentId: string; direction: Direction; occurredAt: Date }[]) {
    await this.guard('gate', async () => {
      const ids = [...new Set(events.map((e) => e.studentId))];
      if (!ids.length) return;
      const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
      const students = new Map(
        (await this.prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((s) => [s.id, s]),
      );
      for (const e of events) {
        const s = students.get(e.studentId);
        if (!s) continue;
        const when = `lúc ${localTime(e.occurredAt, school.timezone)} ngày ${dmy(localDate(e.occurredAt, school.timezone))}`;
        const [kind, title, body] =
          e.direction === Direction.OUT
            ? [NotificationKind.GATE_OUT, 'Con đã rời trường', `${s.fullName} đã ra cổng ${when}.`]
            : e.direction === Direction.IN
              ? [NotificationKind.GATE_IN, 'Con đã đến trường', `${s.fullName} đã vào cổng ${when}.`]
              : [NotificationKind.GATE_IN, 'Điểm danh tại cổng', `${s.fullName} đã điểm danh tại cổng ${when}.`];
        await this.notifications.notifyGuardians(schoolId, s.id, {
          kind,
          title,
          body,
          data: { direction: e.direction, occurredAt: e.occurredAt.toISOString() },
        });
      }
    });
  }

  async invoiceIssued(schoolId: string, invoiceId: string) {
    await this.guard('invoice', async () => {
      const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { student: { select: { fullName: true } } } });
      const due = inv.dueDate ? `, hạn nộp ${dmy(inv.dueDate.toISOString().slice(0, 10))}` : '';
      await this.notifications.notifyGuardians(schoolId, inv.studentId, {
        kind: NotificationKind.INVOICE_ISSUED,
        title: `Thông báo khoản thu: ${inv.title}`,
        body: `${inv.student.fullName}: ${vnd(inv.total)}${due}. Mở ứng dụng để thanh toán bằng QR.`,
        data: { invoiceId: inv.id, total: inv.total, dueDate: inv.dueDate?.toISOString() ?? null },
      });
    });
  }

  async paymentReceived(schoolId: string, paymentId: string) {
    await this.guard('payment', async () => {
      const p = await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { student: { select: { fullName: true } }, invoice: { select: { id: true, title: true, total: true, paidAmount: true } } },
      });
      const left = p.invoice.total - p.invoice.paidAmount;
      await this.notifications.notifyGuardians(schoolId, p.studentId, {
        kind: NotificationKind.PAYMENT_RECEIVED,
        title: 'Nhà trường đã nhận thanh toán',
        body: `Phiếu thu ${p.receiptNo}: ${vnd(p.amount)} cho "${p.invoice.title}" (${p.student.fullName}). ${left > 0 ? `Còn phải nộp ${vnd(left)}.` : 'Đã thu đủ.'}`,
        data: { paymentId: p.id, invoiceId: p.invoice.id, amount: p.amount, receiptNo: p.receiptNo },
      });
    });
  }

  async healthIncident(schoolId: string, incidentId: string) {
    await this.guard('health', async () => {
      const i = await this.prisma.healthIncident.findUniqueOrThrow({ where: { id: incidentId }, include: { student: { select: { fullName: true } } } });
      await this.notifications.notifyGuardians(schoolId, i.studentId, {
        kind: NotificationKind.HEALTH_INCIDENT,
        title: `Sự cố y tế (${SEVERITY[i.severity] ?? i.severity}): ${i.student.fullName}`,
        body: `${i.description}${i.treatment ? ` Xử trí: ${i.treatment}` : ''}`,
        data: { incidentId: i.id, severity: i.severity, occurredAt: i.occurredAt.toISOString() },
      });
    });
  }

  private async guard(what: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.logger.error(`${what} alert failed: ${(e as Error).message}`);
    }
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, SmsAudience, SmsCampaign, SmsCampaignStatus, StudentStatus, SyncStatus, TeacherStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { localDate, zonedToUtc } from '../common/time';
import { HOMEROOM_ONLY } from '../homeroom/homeroom-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsDispatcher } from './sms-dispatcher.service';
import { CampaignQuery, MessageQuery, SmsCampaignDto, SmsPreviewDto, SmsSettingsDto, SmsTemplateDto, UpdateSmsTemplateDto } from './sms.dto';
import { MAX_SEGMENTS, personalise, PLACEHOLDERS, unknownPlaceholders } from './sms-text';

const AUDIENCE_LABEL: Record<SmsAudience, string> = { PARENT: 'phụ huynh', TEACHER: 'giáo viên' };

/** Texts the carrier bills: sent, or still to be sent. Failed ones are not charged. */
const BILLED = [SyncStatus.PENDING, SyncStatus.SUCCESS];

/** How far ahead a text may be scheduled. */
const MAX_AHEAD_DAYS = 90;

/** The defaults of SmsSetting, for a school that never saved its own. */
const DEFAULT_SETTING = { brandname: null as string | null, classMonthlyQuota: 200, schoolMonthlyQuota: 500 };

/** One text to one phone, worded for its recipient. */
interface Recipient {
  phone: string;
  name: string;
  studentId?: string;
  studentName?: string;
  /** The class whose quota pays; null for texts to teachers, which the school pays. */
  classId: string | null;
  className?: string;
  teacherId?: string;
  text: string;
  segments: number;
}

interface Skipped {
  name: string;
  className?: string;
  reason: string;
}

export interface QuotaRow {
  classId: string | null;
  name: string;
  limit: number;
  used: number;
  needed: number;
  remaining: number;
  over: boolean;
}

/** "2026-10" of an instant in the school's time zone. */
export const monthOf = (d: Date, tz: string) => localDate(d, tz).slice(0, 7);

/** UTC [start, end) of a local calendar month "YYYY-MM". */
export function monthRange(month: string, tz: string) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: zonedToUtc(`${month}-01 00:00:00`, tz), end: zonedToUtc(`${next}-01 00:00:00`, tz) };
}

/** "10/2026" for "2026-10". */
const monthLabel = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;

/** "05/10/2026": the local date of an instant. */
const dmyIn = (d: Date, tz: string) => localDate(d, tz).split('-').reverse().join('/');

/**
 * SMS to parents and teachers (Liên lạc): templates with placeholders, texts with
 * or without diacritics, sent now or at a set time, and a monthly quota per class
 * that the office sets. Teachers may text the parents of their own homeroom classes.
 */
@Injectable()
export class SmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly dispatcher: SmsDispatcher,
  ) {}

  // ---- Settings and quotas ----

  async settings(schoolId: string) {
    const s = await this.setting(schoolId);
    return { ...s, provider: this.dispatcher.provider, placeholders: PLACEHOLDERS, maxSegments: MAX_SEGMENTS, maxAheadDays: MAX_AHEAD_DAYS };
  }

  async updateSettings(schoolId: string, dto: SmsSettingsDto) {
    const brandname = dto.brandname === undefined ? undefined : dto.brandname?.trim() || null;
    await this.prisma.smsSetting.upsert({
      where: { schoolId },
      create: { schoolId, brandname: brandname ?? null, classMonthlyQuota: dto.classMonthlyQuota, schoolMonthlyQuota: dto.schoolMonthlyQuota },
      update: { brandname, classMonthlyQuota: dto.classMonthlyQuota, schoolMonthlyQuota: dto.schoolMonthlyQuota },
    });
    return this.settings(schoolId);
  }

  /** A class's own monthly limit; null goes back to the school's default. */
  async setClassQuota(schoolId: string, classId: string, monthlyLimit: number | null) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    if (monthlyLimit === null) await this.prisma.smsClassQuota.deleteMany({ where: { classId } });
    else await this.prisma.smsClassQuota.upsert({ where: { classId }, create: { classId, schoolId, monthlyLimit }, update: { monthlyLimit } });
    return { classId, name: klass.name, monthlyLimit };
  }

  /** What each class (and the school, for texts to teachers) has used of its quota in a month. */
  async usage(user: AuthUser, month?: string) {
    const school = await this.school(user.schoolId);
    const m = month ?? monthOf(new Date(), school.timezone);
    const [setting, year] = await Promise.all([this.setting(user.schoolId), this.years.current(user.schoolId)]);
    const teacher = user.role === Role.TEACHER ? await this.teacherOf(user) : null;
    const classes = await this.prisma.class.findMany({
      where: { schoolId: user.schoolId, academicYearId: year.id, ...(user.role === Role.TEACHER ? { homeroomTeacherId: teacher?.id ?? '' } : {}) },
      select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { fullName: true } }, smsQuota: { select: { monthlyLimit: true } } },
    });
    classes.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true }));
    const used = await this.usedSegments(user.schoolId, m, school.timezone);
    const rows = classes.map((c) => {
      const limit = c.smsQuota?.monthlyLimit ?? setting.classMonthlyQuota;
      const n = used.get(c.id) ?? 0;
      return { classId: c.id, name: c.name, gradeLevel: c.gradeLevel, homeroomTeacher: c.homeroomTeacher?.fullName ?? null, limit, custom: !!c.smsQuota, used: n, remaining: Math.max(0, limit - n) };
    });
    const schoolUsed = used.get(null) ?? 0;
    return {
      month: m,
      classMonthlyQuota: setting.classMonthlyQuota,
      classes: rows,
      // Texts to teachers come out of the school's pool, which only the office manages.
      school: user.role === Role.TEACHER ? null : { limit: setting.schoolMonthlyQuota, used: schoolUsed, remaining: Math.max(0, setting.schoolMonthlyQuota - schoolUsed) },
      used: user.role === Role.TEACHER ? rows.reduce((n, r) => n + r.used, 0) : [...used.values()].reduce((a, b) => a + b, 0),
    };
  }

  // ---- Templates ----

  templates(schoolId: string, audience?: SmsAudience) {
    return this.prisma.smsTemplate.findMany({ where: { schoolId, audience }, orderBy: [{ audience: 'asc' }, { name: 'asc' }] });
  }

  async createTemplate(schoolId: string, dto: SmsTemplateDto) {
    this.assertPlaceholders(dto.body, dto.audience);
    return this.prisma.smsTemplate.create({ data: { schoolId, name: dto.name.trim(), audience: dto.audience, body: dto.body.trim() } });
  }

  async updateTemplate(schoolId: string, id: string, dto: UpdateSmsTemplateDto) {
    const t = await this.prisma.smsTemplate.findFirst({ where: { id, schoolId } });
    if (!t) throw new NotFoundException('Không tìm thấy mẫu tin nhắn');
    const audience = dto.audience ?? t.audience;
    const body = dto.body?.trim() ?? t.body;
    this.assertPlaceholders(body, audience);
    return this.prisma.smsTemplate.update({ where: { id }, data: { name: dto.name?.trim(), audience, body } });
  }

  async removeTemplate(schoolId: string, id: string) {
    const { count } = await this.prisma.smsTemplate.deleteMany({ where: { id, schoolId } });
    if (!count) throw new NotFoundException('Không tìm thấy mẫu tin nhắn');
    return { ok: true };
  }

  // ---- Sending ----

  /** Who would get the text and what it costs, without sending. */
  async preview(user: AuthUser, dto: SmsPreviewDto) {
    const d = await this.draft(user, dto);
    const segments = d.recipients.reduce((n, r) => n + r.segments, 0);
    return {
      recipients: d.recipients.length,
      segments,
      longest: d.recipients.reduce((n, r) => Math.max(n, r.segments), 0),
      maxSegments: MAX_SEGMENTS,
      tooLong: d.recipients.filter((r) => r.segments > MAX_SEGMENTS).length,
      skipped: d.skipped,
      samples: d.recipients.slice(0, 3).map(({ name, phone, studentName, className, text, segments: n }) => ({ name, phone, studentName: studentName ?? null, className: className ?? null, text, segments: n })),
      label: d.label,
      month: d.month,
      quota: d.quota,
      overQuota: d.quota.some((q) => q.over),
    };
  }

  async send(user: AuthUser, dto: SmsCampaignDto) {
    if (dto.scheduledAt) {
      const at = new Date(dto.scheduledAt).getTime();
      if (at < Date.now() - 60_000) throw new BadRequestException('Thời điểm hẹn gửi đã qua');
      if (at > Date.now() + MAX_AHEAD_DAYS * 86_400_000) throw new BadRequestException(`Chỉ hẹn gửi trước tối đa ${MAX_AHEAD_DAYS} ngày`);
    }
    const d = await this.draft(user, dto);
    if (!d.recipients.length) throw new BadRequestException('Không có người nhận nào có số điện thoại hợp lệ');
    const long = d.recipients.find((r) => r.segments > MAX_SEGMENTS);
    if (long) throw new BadRequestException(`Tin nhắn dài quá ${MAX_SEGMENTS} SMS (tin gửi ${long.name} cần ${long.segments} SMS), hãy rút gọn nội dung`);
    const segments = d.recipients.reduce((n, r) => n + r.segments, 0);
    const campaign = await this.withQuotaLock(user.schoolId, async (tx) => {
      await this.assertQuota(tx, user.schoolId, d.recipients, d.month, d.school.timezone);
      const c = await tx.smsCampaign.create({
        data: {
          schoolId: user.schoolId,
          audience: dto.audience,
          title: dto.title.trim(),
          body: dto.body.trim(),
          accented: !!dto.accented,
          scope: { classIds: dto.classIds ?? [], studentIds: dto.studentIds ?? [], teacherIds: dto.teacherIds ?? [], allTeachers: !!dto.allTeachers, label: d.label },
          scheduledAt: d.when,
          recipients: d.recipients.length,
          segments,
          createdById: user.userId,
        },
      });
      await tx.smsMessage.createMany({
        data: d.recipients.map((r, i) => ({
          campaignId: c.id,
          schoolId: user.schoolId,
          seq: i + 1,
          phone: r.phone,
          name: r.name,
          studentId: r.studentId ?? null,
          classId: r.classId,
          teacherId: r.teacherId ?? null,
          body: r.text,
          segments: r.segments,
          nextAttemptAt: d.when,
        })),
      });
      return c;
    });
    if (campaign.scheduledAt.getTime() <= Date.now()) await this.dispatcher.processDue(user.schoolId);
    return this.campaign(user, campaign.id);
  }

  /** Tries the texts that failed once more, if the quota still allows them. */
  async retry(user: AuthUser, id: string) {
    const c = await this.find(user, id);
    if (c.status === SmsCampaignStatus.SCHEDULED || c.status === SmsCampaignStatus.CANCELLED) throw new BadRequestException('Tin nhắn này chưa được gửi');
    const school = await this.school(user.schoolId);
    await this.withQuotaLock(user.schoolId, async (tx) => {
      const failed = await tx.smsMessage.findMany({ where: { campaignId: id, status: SyncStatus.FAILED }, select: { classId: true, segments: true } });
      if (!failed.length) throw new BadRequestException('Không có tin nhắn lỗi để gửi lại');
      // The texts are billed in the month the campaign went out.
      await this.assertQuota(tx, user.schoolId, failed, monthOf(c.scheduledAt, school.timezone), school.timezone);
      await tx.smsMessage.updateMany({ where: { campaignId: id, status: SyncStatus.FAILED }, data: { status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null } });
      await tx.smsCampaign.update({ where: { id }, data: { status: SmsCampaignStatus.SENDING, finishedAt: null } });
    });
    await this.dispatcher.processDue(user.schoolId);
    return this.campaign(user, id);
  }

  /** Calls off a scheduled text before it goes; nothing of it counts against the quota. */
  async cancel(user: AuthUser, id: string) {
    await this.find(user, id);
    const { count } = await this.prisma.smsCampaign.updateMany({ where: { id, status: SmsCampaignStatus.SCHEDULED }, data: { status: SmsCampaignStatus.CANCELLED, cancelledAt: new Date() } });
    if (!count) throw new BadRequestException('Chỉ hủy được tin nhắn hẹn giờ chưa gửi');
    await this.prisma.smsMessage.deleteMany({ where: { campaignId: id } });
    return this.campaign(user, id);
  }

  dispatch(schoolId: string) {
    return this.dispatcher.processDue(schoolId);
  }

  // ---- History ----

  async campaigns(user: AuthUser, query: CampaignQuery): Promise<Page<unknown>> {
    const where: Prisma.SmsCampaignWhereInput = {
      ...this.campaignScope(user),
      status: query.status,
      audience: query.audience,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.smsCampaign.findMany({ where, orderBy: { scheduledAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.smsCampaign.count({ where }),
    ]);
    const [counts, names] = await Promise.all([this.statusCounts(items.map((c) => c.id)), this.userNames(items.map((c) => c.createdById))]);
    return { items: items.map((c) => this.format(c, counts, names)), total, page: query.page, pageSize: query.pageSize };
  }

  async campaign(user: AuthUser, id: string) {
    const c = await this.find(user, id);
    const [counts, names] = await Promise.all([this.statusCounts([id]), this.userNames([c.createdById])]);
    return this.format(c, counts, names);
  }

  async messages(user: AuthUser, id: string, query: MessageQuery): Promise<Page<unknown>> {
    await this.find(user, id);
    const where: Prisma.SmsMessageWhereInput = {
      campaignId: id,
      status: query.status,
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.smsMessage.findMany({ where, orderBy: { seq: 'asc' }, ...pageArgs(query) }),
      this.prisma.smsMessage.count({ where }),
    ]);
    const [students, classes] = await Promise.all([
      this.prisma.student.findMany({ where: { id: { in: items.flatMap((m) => (m.studentId ? [m.studentId] : [])) } }, select: { id: true, code: true, fullName: true } }),
      this.prisma.class.findMany({ where: { id: { in: items.flatMap((m) => (m.classId ? [m.classId] : [])) } }, select: { id: true, name: true } }),
    ]);
    const student = new Map(students.map((s) => [s.id, s]));
    const className = new Map(classes.map((k) => [k.id, k.name]));
    return {
      items: items.map((m) => ({
        id: m.id,
        seq: m.seq,
        name: m.name,
        phone: m.phone,
        student: m.studentId ? (student.get(m.studentId) ?? null) : null,
        className: m.classId ? (className.get(m.classId) ?? null) : null,
        body: m.body,
        segments: m.segments,
        status: m.status,
        attempts: m.attempts,
        lastError: m.lastError,
        sentAt: m.sentAt,
        externalRef: m.externalRef,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ---- Internals ----

  private async setting(schoolId: string, db: Prisma.TransactionClient = this.prisma) {
    const s = await db.smsSetting.findUnique({ where: { schoolId }, select: { brandname: true, classMonthlyQuota: true, schoolMonthlyQuota: true } });
    return s ?? { ...DEFAULT_SETTING };
  }

  private school(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, timezone: true } });
  }

  private teacherOf(user: AuthUser) {
    return this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true } });
  }

  private assertPlaceholders(body: string, audience: SmsAudience) {
    const unknown = unknownPlaceholders(body, audience);
    if (unknown.length) throw new BadRequestException(`Không có trường ${unknown.map((u) => `{${u}}`).join(', ')} cho tin nhắn gửi ${AUDIENCE_LABEL[audience]}`);
  }

  /** Teachers see only the texts they sent. */
  private campaignScope(user: AuthUser): Prisma.SmsCampaignWhereInput {
    return { schoolId: user.schoolId, ...(user.role === Role.TEACHER ? { createdById: user.userId } : {}) };
  }

  private async find(user: AuthUser, id: string) {
    const c = await this.prisma.smsCampaign.findFirst({ where: { id, ...this.campaignScope(user) } });
    if (!c) throw new NotFoundException('Không tìm thấy tin nhắn');
    return c;
  }

  private format(c: SmsCampaign, counts: Map<string, Record<SyncStatus, number>>, names: Map<string, string>) {
    const scope = (c.scope ?? {}) as { label?: string };
    return { ...c, label: scope.label ?? '', createdBy: names.get(c.createdById) ?? null, counts: counts.get(c.id) ?? { PENDING: 0, SUCCESS: 0, FAILED: 0 } };
  }

  private async statusCounts(ids: string[]) {
    const rows = ids.length ? await this.prisma.smsMessage.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }) : [];
    const counts = new Map<string, Record<SyncStatus, number>>();
    for (const r of rows) {
      const c = counts.get(r.campaignId) ?? { PENDING: 0, SUCCESS: 0, FAILED: 0 };
      c[r.status] = r._count._all;
      counts.set(r.campaignId, c);
    }
    return counts;
  }

  private async userNames(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  /** The recipients, quota and wording of a text as it would go out. */
  private async draft(user: AuthUser, dto: SmsPreviewDto) {
    this.assertPlaceholders(dto.body, dto.audience);
    const school = await this.school(user.schoolId);
    const when = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
    const common = { truong: school.name, ngay: dmyIn(when, school.timezone) };
    const { recipients, skipped, label } = dto.audience === SmsAudience.TEACHER ? await this.teacherRecipients(user, dto, common) : await this.parentRecipients(user, dto, common);
    const month = monthOf(when, school.timezone);
    const quota = await this.quotaRows(this.prisma, user.schoolId, recipients, month, school.timezone);
    return { school, when, month, recipients, skipped, label, quota };
  }

  /**
   * One text per student of the picked classes and students, to their primary
   * guardian (or the first guardian with a phone number). Teachers may pick only
   * their homeroom classes and those classes' students.
   */
  private async parentRecipients(user: AuthUser, dto: SmsPreviewDto, common: Record<string, string>) {
    const classIds = [...new Set(dto.classIds ?? [])];
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (!classIds.length && !studentIds.length) throw new BadRequestException('Chọn lớp hoặc học sinh nhận tin nhắn');
    const year = await this.years.current(user.schoolId);
    const classes = classIds.length ? await this.prisma.class.findMany({ where: { id: { in: classIds }, schoolId: user.schoolId, academicYearId: year.id }, select: { id: true, name: true, homeroomTeacherId: true } }) : [];
    if (classes.length !== classIds.length) throw new BadRequestException('Lớp không hợp lệ');
    const enrollments = await this.prisma.enrollment.findMany({
      where: { academicYearId: year.id, class: { schoolId: user.schoolId }, student: { status: StudentStatus.STUDYING }, OR: [{ classId: { in: classIds } }, { studentId: { in: studentIds } }] },
      select: {
        classId: true,
        class: { select: { name: true, homeroomTeacherId: true } },
        student: { select: { id: true, code: true, fullName: true, guardians: { select: { fullName: true, phone: true }, orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] } } },
      },
    });
    const found = new Set(enrollments.map((e) => e.student.id));
    if (studentIds.some((id) => !found.has(id))) throw new BadRequestException('Có học sinh không thuộc trường hoặc không còn đang học');
    if (user.role === Role.TEACHER) {
      const teacher = await this.teacherOf(user);
      const own = (homeroomTeacherId: string | null) => !!teacher && homeroomTeacherId === teacher.id;
      if (classes.some((c) => !own(c.homeroomTeacherId)) || enrollments.some((e) => !own(e.class.homeroomTeacherId))) throw new ForbiddenException(HOMEROOM_ONLY);
    }
    enrollments.sort((a, b) => a.class.name.localeCompare(b.class.name, 'vi', { numeric: true }) || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    const recipients: Recipient[] = [];
    const skipped: Skipped[] = [];
    for (const e of enrollments) {
      const s = e.student;
      const guardian = s.guardians.find((g) => normalizePhone(g.phone));
      if (!guardian) {
        skipped.push({ name: s.fullName, className: e.class.name, reason: 'Chưa có số điện thoại phụ huynh' });
        continue;
      }
      const { text, segments } = personalise(dto.body, { ...common, hoc_sinh: s.fullName, ma_hs: s.code, lop: e.class.name, phu_huynh: guardian.fullName }, !!dto.accented);
      recipients.push({ phone: normalizePhone(guardian.phone)!, name: guardian.fullName, studentId: s.id, studentName: s.fullName, classId: e.classId, className: e.class.name, text, segments });
    }
    const names = classes.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const inClasses = new Set(classIds);
    const extra = studentIds.length ? enrollments.filter((e) => !inClasses.has(e.classId) && studentIds.includes(e.student.id)).length : 0;
    const label = names.length ? `Phụ huynh lớp ${names.join(', ')}${extra ? ` và ${extra} học sinh khác` : ''}` : `Phụ huynh ${extra} học sinh`;
    return { recipients, skipped, label };
  }

  /** Teachers still on the staff, picked one by one or all of them. Only the office texts teachers. */
  private async teacherRecipients(user: AuthUser, dto: SmsPreviewDto, common: Record<string, string>) {
    if (user.role === Role.TEACHER) throw new ForbiddenException('Giáo viên chỉ được nhắn tin cho phụ huynh lớp mình chủ nhiệm');
    const teacherIds = [...new Set(dto.teacherIds ?? [])];
    if (!dto.allTeachers && !teacherIds.length) throw new BadRequestException('Chọn giáo viên nhận tin nhắn');
    const teachers = await this.prisma.teacher.findMany({
      where: { schoolId: user.schoolId, status: { not: TeacherStatus.RESIGNED }, ...(dto.allTeachers ? {} : { id: { in: teacherIds } }) },
      select: { id: true, fullName: true, phone: true, user: { select: { phone: true } } },
    });
    if (!dto.allTeachers && teachers.length !== teacherIds.length) throw new BadRequestException('Giáo viên không hợp lệ');
    teachers.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    const recipients: Recipient[] = [];
    const skipped: Skipped[] = [];
    for (const t of teachers) {
      const phone = normalizePhone(t.phone) ?? normalizePhone(t.user?.phone);
      if (!phone) {
        skipped.push({ name: t.fullName, reason: 'Chưa có số điện thoại' });
        continue;
      }
      const { text, segments } = personalise(dto.body, { ...common, giao_vien: t.fullName }, !!dto.accented);
      recipients.push({ phone, name: t.fullName, teacherId: t.id, classId: null, text, segments });
    }
    return { recipients, skipped, label: dto.allTeachers ? 'Toàn bộ giáo viên' : `${teachers.length} giáo viên` };
  }

  /** SMS sent or waiting in a month, by the class that pays for them (null: the school). */
  private async usedSegments(schoolId: string, month: string, tz: string, db: Prisma.TransactionClient = this.prisma) {
    const { start, end } = monthRange(month, tz);
    const rows = await db.smsMessage.groupBy({ by: ['classId'], where: { schoolId, status: { in: BILLED }, campaign: { scheduledAt: { gte: start, lt: end } } }, _sum: { segments: true } });
    return new Map<string | null, number>(rows.map((r) => [r.classId, r._sum.segments ?? 0]));
  }

  /** Each quota the texts draw on: its limit, what is used, and what these texts need. */
  private async quotaRows(db: Prisma.TransactionClient, schoolId: string, texts: { classId: string | null; segments: number }[], month: string, tz: string): Promise<QuotaRow[]> {
    const needed = new Map<string | null, number>();
    for (const t of texts) needed.set(t.classId, (needed.get(t.classId) ?? 0) + t.segments);
    const classIds = [...needed.keys()].filter((k): k is string => k !== null);
    const [setting, used, classes] = await Promise.all([
      this.setting(schoolId, db),
      this.usedSegments(schoolId, month, tz, db),
      db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, smsQuota: { select: { monthlyLimit: true } } } }),
    ]);
    const byId = new Map(classes.map((c) => [c.id, c]));
    return [...needed].map(([classId, n]) => {
      const c = classId ? byId.get(classId) : undefined;
      const limit = classId ? (c?.smsQuota?.monthlyLimit ?? setting.classMonthlyQuota) : setting.schoolMonthlyQuota;
      const u = used.get(classId) ?? 0;
      return { classId, name: classId ? `Lớp ${c?.name ?? ''}` : 'Quỹ tin chung của trường', limit, used: u, needed: n, remaining: Math.max(0, limit - u), over: u + n > limit };
    });
  }

  private async assertQuota(db: Prisma.TransactionClient, schoolId: string, texts: { classId: string | null; segments: number }[], month: string, tz: string) {
    const over = (await this.quotaRows(db, schoolId, texts, month, tz)).filter((q) => q.over);
    if (over.length) throw new BadRequestException(`Vượt hạn mức tin nhắn tháng ${monthLabel(month)}: ${over.map((q) => `${q.name} còn ${q.remaining} SMS, cần ${q.needed} SMS`).join('; ')}`);
  }

  /** One send at a time per school, so that two texts cannot both fit into the same remaining quota. */
  private async withQuotaLock<T>(schoolId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    await this.prisma.smsSetting.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "schoolId" FROM "SmsSetting" WHERE "schoolId" = ${schoolId} FOR UPDATE`;
      return fn(tx);
    }, { timeout: 30_000 });
  }
}

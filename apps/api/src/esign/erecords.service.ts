import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ERecord, ERecordKind, ERecordStatus, Prisma, Role, SignatureProvider } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { HOMEROOM_ONLY } from '../homeroom/homeroom-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { Letterhead, ReportDocument, Signer, slug, text } from '../reports/document';
import { renderPdf } from '../reports/pdf';
import { dmy, ReportsService } from '../reports/reports.service';
import { contentHash, plainJson, sha256 } from './canonical';
import { ERecordQuery, GenerateERecordsDto } from './esign.dto';
import { PROVIDER_LABEL } from './signature-provider';
import { SignaturesService } from './signatures.service';

export type SignerRole = 'HOMEROOM' | 'PRINCIPAL';

/** One signature on a record, as stored in ERecord.signatures. */
export interface SignatureEntry {
  role: SignerRole;
  userId: string;
  name: string;
  provider: SignatureProvider;
  certSerial: string;
  certSubject: string;
  certIssuer: string;
  certValidFrom: string;
  certValidTo: string;
  /** What was signed: the content hash, then the signatures before this one. */
  digest: string;
  signature: string;
  transactionId: string;
  signedAt: string;
}

/** The stored content: the transcript as generated. Dates are ISO strings in JSON. */
interface Content {
  document: ReportDocument;
  letterhead: Letterhead;
}

export const ROLE_TITLE: Record<SignerRole, string> = { HOMEROOM: 'Giáo viên chủ nhiệm', PRINCIPAL: 'Hiệu trưởng' };

/** The code printed on the paper to look the record up: the start of its content hash. */
export const lookupCode = (hash: string) => hash.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');

/** What a signature covers: the content, and every signature before it (as a countersignature does). */
const digestFor = (hash: string, before: SignatureEntry[]) => sha256(hash + before.map((s) => s.signature).join(''));

const signaturesOf = (r: Pick<ERecord, 'signatures'>) => (r.signatures ?? []) as unknown as SignatureEntry[];

/** "10:23 28/05/2027" in Vietnam time. */
function timeAndDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}/${get('year')}`;
}

/**
 * Học bạ số: each student's transcript for a year, frozen as a signed record. The
 * homeroom teacher signs first, then the principal, with their remote signing
 * accounts; issuing makes it final. A revoked record is replaced by a new version.
 */
@Injectable()
export class ERecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly signatures: SignaturesService,
  ) {}

  /** The class's students, each with their latest record. */
  async list(user: AuthUser, q: ERecordQuery) {
    const klass = await this.classFor(user, q.classId);
    const [enrollments, records, results] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { classId: klass.id }, select: { student: { select: { id: true, code: true, fullName: true, dateOfBirth: true, status: true } } } }),
      this.prisma.eRecord.findMany({ where: { classId: klass.id, kind: ERecordKind.HOC_BA }, orderBy: { version: 'desc' }, omit: { content: true } }),
      this.prisma.termResult.findMany({ where: { classId: klass.id, academicYearId: klass.academicYearId, semester: 0 }, select: { studentId: true, academic: true } }),
    ]);
    const latest = new Map<string, (typeof records)[number]>();
    const versions = new Map<string, number>();
    for (const r of records) {
      if (!latest.has(r.studentId)) latest.set(r.studentId, r);
      versions.set(r.studentId, (versions.get(r.studentId) ?? 0) + 1);
    }
    const hasResults = new Set(results.filter((r) => r.academic !== null).map((r) => r.studentId));
    const students = enrollments
      .map((e) => e.student)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
      .map((s) => {
        const r = latest.get(s.id);
        return {
          ...s,
          hasResults: hasResults.has(s.id),
          versions: versions.get(s.id) ?? 0,
          record: r
            ? { id: r.id, version: r.version, status: r.status, issuedAt: r.issuedAt, revokedAt: r.revokedAt, revokedReason: r.revokedReason, createdAt: r.createdAt, signatures: signaturesOf(r).map(({ role, name, provider, signedAt }) => ({ role, name, provider, signedAt })) }
            : null,
        };
      });
    const counts: Record<ERecordStatus | 'NONE', number> = { NONE: 0, DRAFT: 0, HOMEROOM_SIGNED: 0, ISSUED: 0, REVOKED: 0 };
    for (const s of students) counts[s.record?.status ?? 'NONE']++;
    const filtered = q.status ? students.filter((s) => s.record?.status === q.status) : students;
    const teacher = await this.teacherOf(user);
    return {
      class: { id: klass.id, name: klass.name, academicYear: klass.academicYear, homeroomTeacher: klass.homeroomTeacher },
      // Who the caller may sign as in this class.
      canSign: { homeroom: !!teacher && teacher.id === klass.homeroomTeacherId, principal: user.role === Role.ADMIN },
      counts,
      students: filtered,
    };
  }

  /** Freezes the transcripts of the class (or of some of its students) as unsigned records. */
  async generate(user: AuthUser, dto: GenerateERecordsDto) {
    const klass = await this.classFor(user, dto.classId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId: klass.id, ...(dto.studentIds?.length ? { studentId: { in: dto.studentIds } } : {}) },
      select: { student: { select: { id: true, fullName: true } } },
    });
    if (dto.studentIds?.length && enrollments.length !== new Set(dto.studentIds).size) throw new BadRequestException('Có học sinh không thuộc lớp này');
    const students = enrollments.map((e) => e.student).sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    const ids = students.map((s) => s.id);
    const [latest, results, school] = await Promise.all([
      this.prisma.eRecord.findMany({ where: { studentId: { in: ids }, academicYearId: klass.academicYearId, kind: ERecordKind.HOC_BA }, orderBy: { version: 'desc' }, select: { studentId: true, version: true, status: true } }),
      this.prisma.termResult.findMany({ where: { studentId: { in: ids }, academicYearId: klass.academicYearId, semester: 0 }, select: { studentId: true, academic: true } }),
      this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { principalName: true } }),
    ]);
    const last = new Map<string, { version: number; status: ERecordStatus }>();
    for (const r of latest) if (!last.has(r.studentId)) last.set(r.studentId, r);
    const ready = new Set(results.filter((r) => r.academic !== null).map((r) => r.studentId));
    const skipped: { studentId: string; name: string; reason: string }[] = [];
    let created = 0;
    for (const s of students) {
      const prev = last.get(s.id);
      if (prev && prev.status !== ERecordStatus.REVOKED) {
        skipped.push({ studentId: s.id, name: s.fullName, reason: 'Đã có học bạ số' });
        continue;
      }
      if (!ready.has(s.id)) {
        skipped.push({ studentId: s.id, name: s.fullName, reason: 'Chưa có kết quả học tập cả năm' });
        continue;
      }
      const { document, letterhead } = await this.reports.build(user, 'transcript', { studentId: s.id, academicYearId: klass.academicYearId });
      const content: Content = plainJson({
        document: {
          ...document,
          fileName: slug(`hoc-ba-so-${document.fileName.replace(/^hoc-ba-/, '')}`),
          signer: { title: ROLE_TITLE.PRINCIPAL, name: school.principalName },
          cosigner: { title: ROLE_TITLE.HOMEROOM, name: klass.homeroomTeacher?.fullName ?? null },
        },
        letterhead,
      });
      try {
        await this.prisma.eRecord.create({
          data: {
            schoolId: user.schoolId,
            kind: ERecordKind.HOC_BA,
            studentId: s.id,
            academicYearId: klass.academicYearId,
            classId: klass.id,
            version: (prev?.version ?? 0) + 1,
            content: content as unknown as Prisma.InputJsonValue,
            contentHash: contentHash(content),
            createdById: user.userId,
          },
        });
        created++;
      } catch (e) {
        // Someone generated the same version a moment ago.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') skipped.push({ studentId: s.id, name: s.fullName, reason: 'Đã có học bạ số' });
        else throw e;
      }
    }
    return { created, skipped };
  }

  /**
   * Signs each record at its next step with the caller's account: the homeroom
   * teacher of its class signs a draft, the principal (ADMIN) a record the homeroom
   * teacher has signed, which issues it. Each record succeeds or fails on its own.
   */
  async sign(user: AuthUser, ids: string[]) {
    const { profile, adapter } = await this.signatures.signerOf(user);
    const [teacher, me] = await Promise.all([this.teacherOf(user), this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { fullName: true } })]);
    const records = await this.prisma.eRecord.findMany({
      where: { id: { in: [...new Set(ids)] }, schoolId: user.schoolId },
      include: { student: { select: { fullName: true } } },
    });
    const classes = await this.prisma.class.findMany({ where: { id: { in: [...new Set(records.map((r) => r.classId))] } }, select: { id: true, name: true, homeroomTeacherId: true, academicYear: { select: { name: true } } } });
    const classOf = new Map(classes.map((c) => [c.id, c]));
    const failed: { id: string; name: string; error: string }[] = ids.filter((id) => !records.some((r) => r.id === id)).map((id) => ({ id, name: '', error: 'Không tìm thấy học bạ' }));
    let signed = 0;
    for (const r of records) {
      const klass = classOf.get(r.classId)!;
      const fail = (error: string) => failed.push({ id: r.id, name: r.student.fullName, error });
      let role: SignerRole;
      if (r.status === ERecordStatus.DRAFT) {
        if (!teacher || klass.homeroomTeacherId !== teacher.id) {
          fail(`Giáo viên chủ nhiệm lớp ${klass.name} ký trước`);
          continue;
        }
        role = 'HOMEROOM';
      } else if (r.status === ERecordStatus.HOMEROOM_SIGNED) {
        if (user.role !== Role.ADMIN) {
          fail('Đang chờ Hiệu trưởng ký');
          continue;
        }
        role = 'PRINCIPAL';
      } else {
        fail(r.status === ERecordStatus.ISSUED ? 'Học bạ đã được phát hành' : 'Học bạ đã bị thu hồi');
        continue;
      }
      if (contentHash(r.content) !== r.contentHash) {
        fail('Nội dung học bạ không khớp mã băm, không thể ký');
        continue;
      }
      const before = signaturesOf(r);
      const digest = digestFor(r.contentHash, before);
      try {
        const certificate = { serial: profile.certSerial, subject: profile.certSubject, issuer: profile.certIssuer, validFrom: profile.certValidFrom, validTo: profile.certValidTo };
        const s = await adapter.sign({ account: profile.account, certificate, digest, description: `Học bạ số: ${r.student.fullName}, lớp ${klass.name}, năm học ${klass.academicYear.name}` });
        const entry: SignatureEntry = {
          role,
          userId: user.userId,
          name: me.fullName,
          provider: profile.provider,
          certSerial: profile.certSerial,
          certSubject: profile.certSubject,
          certIssuer: profile.certIssuer,
          certValidFrom: profile.certValidFrom.toISOString(),
          certValidTo: profile.certValidTo.toISOString(),
          digest,
          signature: s.signature,
          transactionId: s.transactionId,
          signedAt: s.signedAt.toISOString(),
        };
        const next = role === 'HOMEROOM' ? ERecordStatus.HOMEROOM_SIGNED : ERecordStatus.ISSUED;
        const { count } = await this.prisma.eRecord.updateMany({
          where: { id: r.id, status: r.status },
          data: { status: next, signatures: [...before, entry] as unknown as Prisma.InputJsonValue, ...(next === ERecordStatus.ISSUED ? { issuedAt: s.signedAt } : {}) },
        });
        if (!count) fail('Học bạ vừa được ký bởi người khác');
        else signed++;
      } catch (e) {
        fail((e as Error).message);
      }
    }
    return { signed, failed };
  }

  /** Withdraws a record; a new version can then be generated in its place. */
  async revoke(user: AuthUser, id: string, reason: string) {
    const r = await this.find(user, id);
    const { count } = await this.prisma.eRecord.updateMany({ where: { id, status: { not: ERecordStatus.REVOKED } }, data: { status: ERecordStatus.REVOKED, revokedAt: new Date(), revokedReason: reason.trim() } });
    if (!count) throw new BadRequestException('Học bạ đã bị thu hồi');
    return this.get(user, r.id);
  }

  /** One record with its content and the check of its hash and signatures. */
  async get(user: AuthUser, id: string) {
    const r = await this.find(user, id);
    const [student, klass, check] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({ where: { id: r.studentId }, select: { id: true, code: true, fullName: true, dateOfBirth: true } }),
      this.prisma.class.findUniqueOrThrow({ where: { id: r.classId }, select: { id: true, name: true, academicYear: { select: { id: true, name: true } } } }),
      this.check(r),
    ]);
    const versions = await this.prisma.eRecord.findMany({ where: { studentId: r.studentId, academicYearId: r.academicYearId, kind: r.kind }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, createdAt: true, revokedReason: true } });
    return { ...r, signatures: signaturesOf(r), student, class: klass, code: lookupCode(r.contentHash), check, versions };
  }

  /** Whether the content still matches its hash and each signature verifies with its certificate. */
  async check(r: Pick<ERecord, 'content' | 'contentHash' | 'signatures' | 'status'>) {
    const contentIntact = contentHash(r.content) === r.contentHash;
    const entries = signaturesOf(r);
    const signatures = await Promise.all(
      entries.map(async (s, i) => {
        const adapter = this.signatures.adapter(s.provider);
        const digestOk = s.digest === digestFor(r.contentHash, entries.slice(0, i));
        const valid = digestOk && (await adapter.verify(s.digest, s.signature, { serial: s.certSerial }));
        const certValid = s.signedAt >= s.certValidFrom && s.signedAt <= s.certValidTo;
        return { role: s.role, title: ROLE_TITLE[s.role], name: s.name, provider: s.provider, providerLabel: PROVIDER_LABEL[s.provider], certSerial: s.certSerial, certSubject: s.certSubject, certIssuer: s.certIssuer, signedAt: s.signedAt, valid, certValid };
      }),
    );
    const sandbox = entries.some((s) => this.signatures.adapter(s.provider).name.startsWith('mock'));
    return { contentIntact, signatures, sandbox, valid: contentIntact && signatures.every((s) => s.valid && s.certValid) && r.status === ERecordStatus.ISSUED };
  }

  /** The record as a PDF: the transcript as frozen, signature stamps, and how to verify it. */
  async pdf(user: AuthUser, id: string, verifyBase: string) {
    const r = await this.find(user, id);
    const check = await this.check(r);
    const content = r.content as unknown as Content;
    const signed = new Map(signaturesOf(r).map((s) => [s.role, s]));
    const stamp = (role: SignerRole, s: Signer | undefined): Signer => {
      const entry = signed.get(role);
      const base = { title: s?.title ?? ROLE_TITLE[role], name: entry?.name ?? s?.name ?? null };
      if (!entry) return { ...base, hint: '(Chưa ký số)' };
      return { ...base, hint: '(Đã ký số)', stamp: ['ĐÃ KÝ SỐ', `Ký bởi: ${entry.name}`, `${PROVIDER_LABEL[entry.provider]}, sê-ri ${entry.certSerial.slice(0, 16)}`, `Thời gian ký: ${timeAndDate(entry.signedAt)}`] };
    };
    const url = `${verifyBase.replace(/\/$/, '')}/verify/${r.id}?code=${lookupCode(r.contentHash)}`;
    const document: ReportDocument = {
      ...content.document,
      date: content.document.date ? new Date(content.document.date) : undefined,
      signer: stamp('PRINCIPAL', content.document.signer),
      cosigner: stamp('HOMEROOM', content.document.cosigner),
      blocks: [
        ...content.document.blocks,
        text(
          [
            `Học bạ số, phiên bản ${r.version}. Mã tra cứu: ${lookupCode(r.contentHash)}. Kiểm tra nội dung và chữ ký số tại ${url}`,
            `Mã băm SHA-256 của nội dung: ${r.contentHash}`,
            ...(r.status === ERecordStatus.REVOKED ? [`ĐÃ THU HỒI ngày ${dmy(r.revokedAt)}: ${r.revokedReason ?? ''}`] : r.status !== ERecordStatus.ISSUED ? ['Chưa phát hành: học bạ chưa đủ chữ ký số.'] : []),
            ...(check.sandbox ? ['Bản thử nghiệm: chữ ký số do môi trường thử nghiệm tạo ra, không có giá trị pháp lý.'] : []),
          ],
          { italic: true, size: 9 },
        ),
      ],
    };
    const letterhead: Letterhead = { ...content.letterhead, date: new Date(content.letterhead.date) };
    return { fileName: `${content.document.fileName}-v${r.version}`, buffer: await renderPdf(document, letterhead) };
  }

  /** What anyone holding the paper may check: the record behind a lookup code. */
  async publicVerify(id: string, code: string) {
    const r = await this.prisma.eRecord.findUnique({ where: { id } });
    if (!r || lookupCode(r.contentHash) !== code.trim().toUpperCase()) throw new NotFoundException('Không tìm thấy học bạ số với mã tra cứu này');
    const [student, klass, school, check] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({ where: { id: r.studentId }, select: { code: true, fullName: true, dateOfBirth: true } }),
      this.prisma.class.findUniqueOrThrow({ where: { id: r.classId }, select: { name: true, academicYear: { select: { name: true } } } }),
      this.prisma.school.findUniqueOrThrow({ where: { id: r.schoolId }, select: { name: true } }),
      this.check(r),
    ]);
    return {
      kind: r.kind,
      status: r.status,
      version: r.version,
      school: school.name,
      student: { code: student.code, fullName: student.fullName, dateOfBirth: dmy(student.dateOfBirth) },
      className: klass.name,
      academicYear: klass.academicYear.name,
      issuedAt: r.issuedAt,
      revokedAt: r.revokedAt,
      revokedReason: r.revokedReason,
      contentHash: r.contentHash,
      valid: check.valid,
      contentIntact: check.contentIntact,
      sandbox: check.sandbox,
      signatures: check.signatures.map(({ title, name, providerLabel, certSerial, signedAt, valid, certValid }) => ({ title, name, providerLabel, certSerial, signedAt, valid: valid && certValid })),
    };
  }

  // ---- internals ----

  private teacherOf(user: AuthUser) {
    return this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true } });
  }

  /** The class, which the office may open and a teacher only when they are its homeroom teacher. */
  private async classFor(user: AuthUser, classId: string) {
    const klass = await this.prisma.class.findFirst({
      where: { id: classId, schoolId: user.schoolId },
      select: { id: true, name: true, academicYearId: true, homeroomTeacherId: true, academicYear: { select: { id: true, name: true } }, homeroomTeacher: { select: { id: true, fullName: true } } },
    });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    if (user.role === Role.TEACHER) {
      const teacher = await this.teacherOf(user);
      if (!teacher || teacher.id !== klass.homeroomTeacherId) throw new ForbiddenException(HOMEROOM_ONLY);
    }
    return klass;
  }

  private async find(user: AuthUser, id: string) {
    const r = await this.prisma.eRecord.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new NotFoundException('Không tìm thấy học bạ số');
    if (user.role === Role.TEACHER) await this.classFor(user, r.classId);
    return r;
  }
}

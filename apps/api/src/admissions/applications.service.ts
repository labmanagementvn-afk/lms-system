import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionRoundStatus, ApplicationSource, ApplicationStatus, GuardianRelationship, Prisma, Role } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationDto, ApplicationQuery, ApplicationStatusDto, BulkEnrolDto, ImportApplicationsDto, UpdateApplicationDto } from './admissions.dto';
import { applicationCode, applicationPrefix, isUniqueViolation, nextStudentCode } from './codes';
import { parseCsv, serializeCsv } from './csv';
import { cleanName, FIELD_LABELS, GENDER_LABELS, ImportedApplication, mapHeaders, mapRow, RELATIONSHIP_LABELS, SOURCE_LABELS, STATUS_LABELS } from './import-mapping';
import { RoundsService } from './rounds.service';

const include = {
  round: { select: { id: true, name: true, gradeLevel: true, capacity: true, status: true } },
  class: { select: { id: true, name: true } },
  student: { select: { id: true, code: true } },
} satisfies Prisma.AdmissionApplicationInclude;

/** Allowed status moves; ENROLLED is only reached through enrol(). */
const TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  SUBMITTED: [ApplicationStatus.SCREENING, ApplicationStatus.WITHDRAWN],
  SCREENING: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN],
  ACCEPTED: [ApplicationStatus.WITHDRAWN],
};

const CODE_ATTEMPTS = 10;
const dateOnly = (s: string) => new Date(s.slice(0, 10));
const fmtDate = (d: Date | null | undefined) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rounds: RoundsService,
  ) {}

  async list(schoolId: string, query: ApplicationQuery): Promise<Page<unknown>> {
    const where: Prisma.AdmissionApplicationWhereInput = {
      schoolId,
      roundId: query.roundId,
      status: query.status,
      source: query.source,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
            { guardianPhone: { contains: query.q.replace(/\D/g, '') || query.q } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.admissionApplication.findMany({ where, include, orderBy: { submittedAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.admissionApplication.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** One application; its round carries the seats already taken so the UI can warn about the capacity. */
  async get(schoolId: string, id: string) {
    const app = await this.prisma.admissionApplication.findFirst({ where: { id, schoolId }, include });
    if (!app) throw new NotFoundException('Không tìm thấy hồ sơ');
    const acceptedCount = await this.prisma.admissionApplication.count({
      where: { roundId: app.roundId, status: { in: [ApplicationStatus.ACCEPTED, ApplicationStatus.ENROLLED] } },
    });
    return { ...app, round: { ...app.round, acceptedCount } };
  }

  /**
   * Creates an application. The public form may only submit to open rounds
   * within their dates; staff may add to any round that is not closed.
   */
  async create(schoolId: string, dto: ApplicationDto, source: ApplicationSource) {
    const round = await this.prisma.admissionRound.findFirst({ where: { id: dto.roundId, schoolId } });
    if (!round) throw new BadRequestException('Đợt tuyển sinh không hợp lệ');
    if (round.status === AdmissionRoundStatus.CLOSED) throw new BadRequestException('Đợt tuyển sinh đã đóng');
    if (source === ApplicationSource.ONLINE) {
      const today = await this.rounds.today(schoolId);
      if (round.startDate > today || round.endDate < today) throw new BadRequestException('Ngoài thời gian nhận hồ sơ của đợt tuyển sinh');
    }
    const phone = normalizePhone(dto.guardianPhone);
    if (!phone) throw new BadRequestException('Số điện thoại không hợp lệ');
    return this.insert(schoolId, round.id, source, {
      fullName: cleanName(dto.fullName),
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth,
      address: dto.address,
      previousSchool: dto.previousSchool,
      guardianName: cleanName(dto.guardianName),
      guardianPhone: phone,
      guardianEmail: dto.guardianEmail,
      guardianRelationship: dto.guardianRelationship ?? GuardianRelationship.GUARDIAN,
      notes: dto.notes,
    });
  }

  /** Inserts one application with a fresh code; 409 when the same child was already submitted to the round. */
  private async insert(schoolId: string, roundId: string, source: ApplicationSource, data: ImportedApplication) {
    const dateOfBirth = dateOnly(data.dateOfBirth);
    if (await this.isDuplicate(roundId, data.fullName, dateOfBirth, data.guardianPhone)) throw new ConflictException('Hồ sơ này đã được nộp');
    const year = (await this.rounds.today(schoolId)).getUTCFullYear();
    const base = await this.prisma.admissionApplication.count({ where: { schoolId, code: { startsWith: applicationPrefix(year) } } });
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.admissionApplication.create({
          data: {
            schoolId,
            roundId,
            source,
            code: applicationCode(year, base + 1 + attempt),
            fullName: data.fullName,
            gender: data.gender ?? null,
            dateOfBirth,
            address: data.address ?? null,
            previousSchool: data.previousSchool ?? null,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            guardianEmail: data.guardianEmail ?? null,
            guardianRelationship: data.guardianRelationship,
            notes: data.notes ?? null,
          },
          include,
        });
      } catch (e) {
        if (isUniqueViolation(e, 'code') && attempt < CODE_ATTEMPTS) continue;
        if (isUniqueViolation(e, 'guardianPhone')) throw new ConflictException('Hồ sơ này đã được nộp');
        throw e;
      }
    }
  }

  private async isDuplicate(roundId: string, fullName: string, dateOfBirth: Date, guardianPhone: string) {
    return !!(await this.prisma.admissionApplication.findFirst({ where: { roundId, fullName, dateOfBirth, guardianPhone }, select: { id: true } }));
  }

  async update(schoolId: string, id: string, dto: UpdateApplicationDto) {
    const app = await this.get(schoolId, id);
    if (app.status === ApplicationStatus.ENROLLED) throw new BadRequestException('Hồ sơ đã nhập học, không thể sửa');
    const phone = dto.guardianPhone === undefined ? undefined : normalizePhone(dto.guardianPhone);
    if (phone === null) throw new BadRequestException('Số điện thoại không hợp lệ');
    try {
      return await this.prisma.admissionApplication.update({
        where: { id },
        data: {
          fullName: dto.fullName === undefined ? undefined : cleanName(dto.fullName),
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? dateOnly(dto.dateOfBirth) : undefined,
          address: dto.address,
          previousSchool: dto.previousSchool,
          guardianName: dto.guardianName === undefined ? undefined : cleanName(dto.guardianName),
          guardianPhone: phone,
          guardianEmail: dto.guardianEmail,
          guardianRelationship: dto.guardianRelationship,
          notes: dto.notes,
          score: dto.score,
          screeningNote: dto.screeningNote,
        },
        include,
      });
    } catch (e) {
      if (isUniqueViolation(e, 'guardianPhone')) throw new ConflictException('Hồ sơ này đã được nộp');
      throw e;
    }
  }

  async setStatus(schoolId: string, id: string, dto: ApplicationStatusDto) {
    const app = await this.get(schoolId, id);
    if (dto.status === ApplicationStatus.ENROLLED) throw new BadRequestException('Nhập học qua chức năng "Nhập học" để tạo học sinh');
    if (!TRANSITIONS[app.status]?.includes(dto.status)) {
      throw new BadRequestException(`Không thể chuyển hồ sơ từ "${STATUS_LABELS[app.status]}" sang "${STATUS_LABELS[dto.status]}"`);
    }
    return this.prisma.admissionApplication.update({
      where: { id },
      data: { status: dto.status, screeningNote: dto.note === undefined ? undefined : dto.note },
      include,
    });
  }

  /** Parses the CSV and creates IMPORT applications; duplicate children are skipped, bad rows reported. */
  async importCsv(schoolId: string, dto: ImportApplicationsDto) {
    const round = await this.prisma.admissionRound.findFirst({ where: { id: dto.roundId, schoolId } });
    if (!round) throw new BadRequestException('Đợt tuyển sinh không hợp lệ');
    if (round.status === AdmissionRoundStatus.CLOSED) throw new BadRequestException('Đợt tuyển sinh đã đóng');
    const rows = parseCsv(dto.csv);
    if (rows.length < 2) throw new BadRequestException('File không có dữ liệu (cần dòng tiêu đề và ít nhất một dòng hồ sơ)');
    const { columns, missing } = mapHeaders(rows[0]);
    if (missing.length) throw new BadRequestException(`Thiếu cột: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}`);

    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      const row = i + 1; // spreadsheet row number, header being row 1
      const mapped = mapRow(columns, rows[i]);
      if (!mapped.data) {
        errors.push({ row, message: mapped.errors.join('; ') });
        continue;
      }
      const key = `${mapped.data.fullName}|${mapped.data.dateOfBirth}|${mapped.data.guardianPhone}`;
      if (seen.has(key) || (await this.isDuplicate(round.id, mapped.data.fullName, dateOnly(mapped.data.dateOfBirth), mapped.data.guardianPhone))) {
        skipped++;
        continue;
      }
      seen.add(key);
      try {
        await this.insert(schoolId, round.id, ApplicationSource.IMPORT, mapped.data);
        created++;
      } catch (e) {
        if (e instanceof ConflictException) skipped++;
        else errors.push({ row, message: e instanceof Error ? e.message : 'Lỗi không xác định' });
      }
    }
    return { created, skipped, errors };
  }

  /** Vietnamese-headed CSV (re-importable: the first ten columns are the import template). */
  async exportCsv(schoolId: string, roundId?: string): Promise<string> {
    const apps = await this.prisma.admissionApplication.findMany({ where: { schoolId, roundId }, include, orderBy: { code: 'asc' } });
    const header = [
      ...Object.values(FIELD_LABELS),
      'Mã hồ sơ',
      'Trạng thái',
      'Nguồn',
      'Điểm',
      'Ghi chú xét tuyển',
      'Lớp',
      'Mã học sinh',
      'Đợt tuyển sinh',
      'Ngày nộp',
    ];
    const rows = apps.map((a) => [
      a.fullName,
      a.gender ? GENDER_LABELS[a.gender] : '',
      fmtDate(a.dateOfBirth),
      a.address,
      a.previousSchool,
      a.guardianName,
      a.guardianPhone,
      a.guardianEmail,
      RELATIONSHIP_LABELS[a.guardianRelationship],
      a.notes,
      a.code,
      STATUS_LABELS[a.status],
      SOURCE_LABELS[a.source],
      a.score,
      a.screeningNote,
      a.class?.name,
      a.student?.code,
      a.round.name,
      fmtDate(a.submittedAt),
    ]);
    return serializeCsv([header, ...rows], { bom: true });
  }

  /**
   * Turns an accepted application into a student: the student record, its
   * primary guardian (linked to the parent account with the same phone, if
   * any) and the enrolment in the class, all in one transaction.
   */
  async enrol(schoolId: string, id: string, classId: string) {
    const app = await this.get(schoolId, id);
    if (app.status !== ApplicationStatus.ACCEPTED) throw new BadRequestException('Chỉ nhập học được hồ sơ đã trúng tuyển');
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, include: { academicYear: { select: { id: true, startDate: true } } } });
    if (!klass) throw new BadRequestException('Lớp không hợp lệ');
    const parent = await this.prisma.user.findFirst({ where: { phone: app.guardianPhone, schoolId, role: Role.PARENT }, select: { id: true } });
    const year = klass.academicYear.startDate.getUTCFullYear();
    const codes = (await this.prisma.student.findMany({ where: { schoolId, code: { startsWith: `HS${year}` } }, select: { code: true } })).map((s) => s.code);

    for (let attempt = 0; ; attempt++) {
      const code = nextStudentCode(year, codes, attempt);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const student = await tx.student.create({
            data: {
              schoolId,
              code,
              fullName: app.fullName,
              gender: app.gender,
              dateOfBirth: app.dateOfBirth,
              address: app.address,
              guardians: {
                create: {
                  fullName: app.guardianName,
                  relationship: app.guardianRelationship,
                  phone: app.guardianPhone,
                  email: app.guardianEmail,
                  isPrimary: true,
                  userId: parent?.id,
                },
              },
              enrollments: { create: { classId: klass.id, academicYearId: klass.academicYearId } },
            },
          });
          return tx.admissionApplication.update({
            where: { id },
            data: { status: ApplicationStatus.ENROLLED, classId: klass.id, studentId: student.id },
            include,
          });
        });
      } catch (e) {
        if (isUniqueViolation(e, 'code') && attempt < CODE_ATTEMPTS) continue;
        throw e;
      }
    }
  }

  async bulkEnrol(schoolId: string, dto: BulkEnrolDto) {
    const results: { id: string; ok: boolean; code?: string; studentCode?: string; error?: string }[] = [];
    for (const id of [...new Set(dto.ids)]) {
      try {
        const app = await this.enrol(schoolId, id, dto.classId);
        results.push({ id, ok: true, code: app.code, studentCode: app.student?.code });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : 'Lỗi không xác định' });
      }
    }
    return { enrolled: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  // ---- Public ----

  async publicInfo(schoolCode: string) {
    const school = await this.findSchool(schoolCode);
    return { school: { name: school.name, code: school.code, address: school.address }, rounds: await this.rounds.openRounds(school.id) };
  }

  async publicSubmit(schoolCode: string, dto: ApplicationDto) {
    const school = await this.findSchool(schoolCode);
    const app = await this.create(school.id, dto, ApplicationSource.ONLINE);
    return { code: app.code, fullName: app.fullName, round: { name: app.round.name } };
  }

  /** Status lookup for parents: the code alone is not enough, the guardian phone must match. */
  async publicLookup(schoolCode: string, code: string, phone: string) {
    const school = await this.findSchool(schoolCode);
    const app = await this.prisma.admissionApplication.findFirst({ where: { schoolId: school.id, code: code.trim().toUpperCase() }, include });
    if (!app || app.guardianPhone !== normalizePhone(phone)) throw new NotFoundException('Không tìm thấy hồ sơ với mã và số điện thoại này');
    return {
      code: app.code,
      fullName: app.fullName,
      dateOfBirth: app.dateOfBirth,
      status: app.status,
      submittedAt: app.submittedAt,
      updatedAt: app.updatedAt,
      round: { name: app.round.name, gradeLevel: app.round.gradeLevel },
      class: app.class,
    };
  }

  private async findSchool(code: string) {
    const school = await this.prisma.school.findUnique({ where: { code }, select: { id: true, name: true, code: true, address: true } });
    if (!school) throw new NotFoundException('Không tìm thấy trường');
    return school;
  }
}

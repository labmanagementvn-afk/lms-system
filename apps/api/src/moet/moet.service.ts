import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuardianRelationship, MoetExport, MoetExportKind, MoetExportStatus, Prisma, StudentStatus } from '@prisma/client';
import { CsvCell } from '../admissions/csv';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { buildCsv, classRow, MOET_COLUMNS, parseStudentImport, studentImportTemplate, studentRow, teacherRow, termResultRow } from './moet-csv';
import { CreateExportDto, ExportQuery, ImportStudentsDto } from './moet.dto';

const FILE_PREFIX: Record<MoetExportKind, string> = { STUDENTS: 'HocSinh', TEACHERS: 'GiaoVien', CLASSES: 'LopHoc', TERM_RESULTS: 'KetQuaHocKy' };

/**
 * Trao đổi dữ liệu CSDL ngành: builds the MOET exchange files from the school's records
 * (and reads student lists back). The adapter speaks the template's CSV layout; the
 * authority's own upload portal or API is the next hop, outside this system.
 */
@Injectable()
export class MoetService {
  private readonly logger = new Logger(MoetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async list(schoolId: string, query: ExportQuery): Promise<Page<MoetExport>> {
    const where: Prisma.MoetExportWhereInput = { schoolId, kind: query.kind };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.moetExport.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.moetExport.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Builds the file, stores it and records the export; a failure is recorded too, so the history shows it. */
  async create(schoolId: string, userId: string, dto: CreateExportDto): Promise<MoetExport> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { code: true, moetCode: true } });
    const moetCode = school.moetCode ?? school.code;
    const year = await this.resolveYear(schoolId, dto.academicYearId, dto.kind);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `${FILE_PREFIX[dto.kind]}_${moetCode.replace(/[^\w-]+/g, '')}_${stamp}${dto.kind === MoetExportKind.TERM_RESULTS ? `_HK${dto.semester ?? 1}` : ''}.csv`;
    try {
      const { header, rows } = await this.build(schoolId, moetCode, dto.kind, year, dto.semester ?? 1);
      const file = await this.uploads.storeBuffer(schoolId, userId, fileName, 'text/csv; charset=utf-8', Buffer.from(buildCsv(header, rows), 'utf8'));
      return await this.prisma.moetExport.create({
        data: { schoolId, kind: dto.kind, academicYearId: year?.id, semester: dto.kind === MoetExportKind.TERM_RESULTS ? (dto.semester ?? 1) : null, fileId: file.id, fileName, rows: rows.length, createdById: userId },
      });
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`export ${dto.kind} failed: ${(e as Error).message}`);
      return this.prisma.moetExport.create({
        data: { schoolId, kind: dto.kind, academicYearId: year?.id, fileName, status: MoetExportStatus.FAILED, error: (e as Error).message.slice(0, 500), createdById: userId },
      });
    }
  }

  /** The year asked for, else the current one (teachers need none). */
  async resolveYear(schoolId: string, academicYearId: string | undefined, kind: MoetExportKind) {
    if (academicYearId) {
      const y = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
      if (!y) throw new NotFoundException('Không tìm thấy năm học');
      return y;
    }
    const current = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!current && kind !== MoetExportKind.TEACHERS) throw new BadRequestException('Chưa có năm học hiện tại');
    return current;
  }

  /** The header and rows of one kind in the exchange template; the file export and the direct sync both send these. */
  async build(schoolId: string, moetCode: string, kind: MoetExportKind, year: { id: string; name: string } | null, semester: number): Promise<{ header: string[]; rows: CsvCell[][] }> {
    switch (kind) {
      case MoetExportKind.STUDENTS: {
        const students = await this.prisma.student.findMany({
          where: { schoolId },
          orderBy: [{ status: 'asc' }, { code: 'asc' }],
          include: {
            guardians: { orderBy: { isPrimary: 'desc' }, take: 1 },
            enrollments: { where: { academicYearId: year!.id }, select: { class: { select: { name: true, gradeLevel: true } } }, take: 1 },
          },
        });
        return {
          header: MOET_COLUMNS.STUDENTS,
          rows: students.map((s) =>
            studentRow({
              moetCode,
              code: s.code,
              fullName: s.fullName,
              dateOfBirth: s.dateOfBirth,
              gender: s.gender,
              gradeLevel: s.enrollments[0]?.class.gradeLevel ?? null,
              className: s.enrollments[0]?.class.name ?? null,
              status: s.status,
              address: s.address,
              guardian: s.guardians[0] ? { fullName: s.guardians[0].fullName, relationship: s.guardians[0].relationship, phone: s.guardians[0].phone } : null,
            }),
          ),
        };
      }
      case MoetExportKind.TEACHERS: {
        const teachers = await this.prisma.teacher.findMany({ where: { schoolId }, orderBy: { code: 'asc' }, include: { subjects: { include: { subject: { select: { name: true } } } } } });
        return {
          header: MOET_COLUMNS.TEACHERS,
          rows: teachers.map((t) =>
            teacherRow({ moetCode, code: t.code, fullName: t.fullName, dateOfBirth: t.dateOfBirth, gender: t.gender, phone: t.phone, email: t.email, status: t.status, subjects: t.subjects.map((s) => s.subject.name) }),
          ),
        };
      }
      case MoetExportKind.CLASSES: {
        const classes = await this.prisma.class.findMany({
          where: { schoolId, academicYearId: year!.id },
          orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
          include: { homeroomTeacher: { select: { code: true, fullName: true } }, _count: { select: { enrollments: true } } },
        });
        return {
          header: MOET_COLUMNS.CLASSES,
          rows: classes.map((c) =>
            classRow({ moetCode, academicYear: year!.name, gradeLevel: c.gradeLevel, name: c.name, room: c.room, homeroomCode: c.homeroomTeacher?.code ?? null, homeroomName: c.homeroomTeacher?.fullName ?? null, size: c._count.enrollments }),
          ),
        };
      }
      case MoetExportKind.TERM_RESULTS: {
        const subjects = await this.prisma.subject.findMany({ where: { schoolId }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } });
        const [results, subjectResults] = await Promise.all([
          this.prisma.termResult.findMany({
            where: { schoolId, academicYearId: year!.id, semester },
            include: { student: { select: { code: true, fullName: true } }, class: { select: { name: true, gradeLevel: true } } },
          }),
          this.prisma.subjectResult.findMany({ where: { schoolId, academicYearId: year!.id, semester }, select: { studentId: true, subjectId: true, average: true } }),
        ]);
        const byStudent = new Map<string, Record<string, number | null>>();
        for (const r of subjectResults) {
          const row = byStudent.get(r.studentId) ?? {};
          row[subjects.find((s) => s.id === r.subjectId)?.code ?? r.subjectId] = r.average === null ? null : Number(r.average);
          byStudent.set(r.studentId, row);
        }
        const codes = subjects.map((s) => s.code);
        results.sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.class.name.localeCompare(b.class.name) || a.student.code.localeCompare(b.student.code));
        return {
          header: [...MOET_COLUMNS.TERM_RESULTS, ...subjects.map((s) => `Điểm TB ${s.name}`)],
          rows: results.map((r) =>
            termResultRow(
              {
                moetCode,
                academicYear: year!.name,
                semester,
                className: r.class.name,
                code: r.student.code,
                fullName: r.student.fullName,
                academic: r.academic,
                conduct: r.conduct,
                title: r.title,
                promotion: r.promotion,
                absentDays: r.absentDays,
                averages: byStudent.get(r.studentId) ?? {},
              },
              codes,
            ),
          ),
        };
      }
    }
  }

  /** The stored file of an export, for download. */
  async file(schoolId: string, id: string) {
    const exp = await this.prisma.moetExport.findFirst({ where: { id, schoolId } });
    if (!exp || !exp.fileId) throw new NotFoundException('Không tìm thấy tệp xuất');
    const file = await this.uploads.get(schoolId, exp.fileId);
    return { export: exp, file, stream: this.uploads.stream(file) };
  }

  async template(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { code: true, moetCode: true } });
    return studentImportTemplate(school.moetCode ?? school.code);
  }

  /**
   * Upserts students by code from a MOET-format list: new codes are created, known ones
   * updated; a "Lớp" that exists in the current year enrols the student; a guardian is
   * added when the student has none. `dryRun` validates and counts without writing.
   */
  async importStudents(schoolId: string, dto: ImportStudentsDto) {
    const { rows, errors } = parseStudentImport(dto.csv);
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    const classes = year ? await this.prisma.class.findMany({ where: { schoolId, academicYearId: year.id }, select: { id: true, name: true } }) : [];
    const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
    const existing = await this.prisma.student.findMany({ where: { schoolId, code: { in: rows.map((r) => r.code) } }, select: { id: true, code: true, _count: { select: { guardians: true } } } });
    const existingByCode = new Map(existing.map((s) => [s.code, s]));

    const unknownClasses = [...new Set(rows.filter((r) => r.className && !classByName.has(r.className.toLowerCase())).map((r) => r.className!))];
    const summary = { total: rows.length, created: 0, updated: 0, enrolled: 0, guardians: 0, unknownClasses, errors, dryRun: !!dto.dryRun };
    for (const r of rows) {
      const found = existingByCode.get(r.code);
      found ? summary.updated++ : summary.created++;
      if (r.className && classByName.has(r.className.toLowerCase())) summary.enrolled++;
      if (r.guardian && (!found || found._count.guardians === 0)) summary.guardians++;
    }
    if (dto.dryRun || !rows.length) return summary;

    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const data = {
          fullName: r.fullName,
          dateOfBirth: r.dateOfBirth ? new Date(`${r.dateOfBirth}T00:00:00Z`) : undefined,
          gender: r.gender ?? undefined,
          address: r.address ?? undefined,
          status: r.status ?? undefined,
        };
        const found = existingByCode.get(r.code);
        const student = found
          ? await tx.student.update({ where: { id: found.id }, data })
          : await tx.student.create({ data: { schoolId, code: r.code, ...data, status: r.status ?? StudentStatus.STUDYING } });
        const classId = r.className ? classByName.get(r.className.toLowerCase()) : undefined;
        if (classId && year) {
          await tx.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
            create: { studentId: student.id, classId, academicYearId: year.id },
            update: { classId },
          });
        }
        if (r.guardian && (!found || found._count.guardians === 0)) {
          await tx.guardian.create({
            data: { studentId: student.id, fullName: r.guardian.fullName, relationship: r.guardian.relationship as GuardianRelationship, phone: r.guardian.phone, isPrimary: true },
          });
        }
      }
    });
    return summary;
  }
}

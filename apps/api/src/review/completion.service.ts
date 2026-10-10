import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentType, Prisma, ResultLevel, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { DEFAULT_SETTING, loadSettings, num, SubjectSettingLike, withRetakes } from '../grades/results';
import { completionGaps, SubjectOutcome, YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { CompletionStudentDto, CouncilDto, CouncilMemberDto, RecognizeDto } from './review.dto';

/** The grade that ends lower secondary school. */
export const COMPLETION_GRADE = 9;
export const DEFAULT_DECISION_SIGNER = 'Chủ tịch Hội đồng';

export interface CouncilMember {
  name: string;
  position?: string;
  role: string;
}

/** A student a recognition decision left out, as they stood at the decision. */
export interface NotRecognized {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  class: { id: string; name: string };
  conduct: ResultLevel | null;
  academic: ResultLevel | null;
  absentDays: number;
  gaps: string[];
}

const roundSelect = {
  id: true,
  round: true,
  councilDecisionNo: true,
  councilDecidedOn: true,
  meetingAt: true,
  meetingPlace: true,
  members: true,
  decisionNo: true,
  decidedOn: true,
  signerTitle: true,
  signerName: true,
  recognizedAt: true,
  notRecognized: true,
} as const;
type RoundRow = Prisma.CompletionRoundGetPayload<{ select: typeof roundSelect }>;

/** The year the review happens in: age counts by year of birth against it (Hà Nội guidance, "tính theo năm"). */
const reviewYearOf = (year: { endDate: Date }) => year.endDate.getUTCFullYear();

/**
 * Xét công nhận hoàn thành chương trình giáo dục THCS. Since the 2025 Education
 * Law amendment there is no THCS diploma: a council recognises grade 9 students
 * who completed the programme, in a first round before the school year ends and
 * a second one before the next starts, and the principal confirms it in the học bạ.
 */
@Injectable()
export class CompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  private view(round: number, row: RoundRow | null, fallbackMembers: CouncilMember[] = []) {
    return {
      round,
      saved: !!row,
      councilDecisionNo: row?.councilDecisionNo ?? null,
      councilDecidedOn: row?.councilDecidedOn ?? null,
      meetingAt: row?.meetingAt ?? null,
      meetingPlace: row?.meetingPlace ?? null,
      members: row ? (row.members as unknown as CouncilMember[]) : fallbackMembers,
      decisionNo: row?.decisionNo ?? null,
      decidedOn: row?.decidedOn ?? null,
      signerTitle: row?.signerTitle ?? null,
      signerName: row?.signerName ?? null,
      recognizedAt: row?.recognizedAt ?? null,
    };
  }

  /** Both rounds of the current year as stored, round 1 first. */
  private async rounds(academicYearId: string) {
    const rows = await this.prisma.completionRound.findMany({ where: { academicYearId }, select: roundSelect, orderBy: { round: 'asc' } });
    return { first: rows.find((r) => r.round === 1) ?? null, second: rows.find((r) => r.round === 2) ?? null };
  }

  /** Every grade 9 student of the current year with the conditions, gaps and what was recognised. */
  async candidates(schoolId: string, filter: { classId?: string; studentId?: string } = {}) {
    const year = await this.years.current(schoolId);
    const reviewYear = reviewYearOf(year);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: year.id,
        class: { schoolId, gradeLevel: COMPLETION_GRADE, ...(filter.classId ? { id: filter.classId } : {}) },
        student: { status: StudentStatus.STUDYING },
        ...(filter.studentId ? { studentId: filter.studentId } : {}),
      },
      select: {
        class: { select: { id: true, name: true } },
        student: { select: { id: true, code: true, fullName: true, gender: true, dateOfBirth: true } },
      },
    });
    const ids = enrollments.map((e) => e.student.id);
    const [terms, results, retakes, records, settings, subjects] = await Promise.all([
      this.prisma.termResult.findMany({
        where: { academicYearId: year.id, semester: YEAR, studentId: { in: ids } },
        select: { studentId: true, academic: true, conduct: true, absentDays: true, academicAfterRetake: true, conductAfterTraining: true, promotionOverride: true },
      }),
      this.prisma.subjectResult.findMany({ where: { academicYearId: year.id, semester: YEAR, studentId: { in: ids }, exempt: false }, select: { studentId: true, subjectId: true, average: true, passed: true } }),
      this.prisma.subjectRetake.findMany({ where: { academicYearId: year.id, studentId: { in: ids } }, select: { studentId: true, subjectId: true, score: true, passed: true } }),
      this.prisma.completionRecord.findMany({
        where: { academicYearId: year.id, studentId: { in: ids } },
        select: { studentId: true, dossierComplete: true, priority: true, note: true, registerNo: true, recognizedAt: true, round: { select: { round: true, decisionNo: true, decidedOn: true } } },
      }),
      loadSettings(this.prisma, schoolId),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    const settingOf = (subjectId: string): SubjectSettingLike => settings.get(subjectId) ?? DEFAULT_SETTING;
    const nameOf = new Map(subjects.map((s) => [s.id, s.name]));
    const students = enrollments.map(({ class: klass, student }) => {
      const term = terms.find((t) => t.studentId === student.id);
      const record = records.find((r) => r.studentId === student.id);
      const year0 = new Map<string, SubjectOutcome>(
        results.filter((r) => r.studentId === student.id).map((r) => [r.subjectId, { assessment: settingOf(r.subjectId).assessment, average: num(r.average), passed: r.passed }]),
      );
      const { outcomes } = withRetakes(year0, retakes.filter((r) => r.studentId === student.id), settingOf);
      const failedSubjects = [...outcomes.entries()].filter(([, o]) => o.assessment === AssessmentType.COMMENT && o.passed === false).map(([id]) => nameOf.get(id) ?? '');
      const academic = term?.academicAfterRetake ?? term?.academic ?? null;
      const conduct = term?.conductAfterTraining ?? term?.conduct ?? null;
      const absentDays = term?.absentDays ?? 0;
      const birthYear = student.dateOfBirth ? student.dateOfBirth.getUTCFullYear() : null;
      const dossierComplete = record?.dossierComplete ?? true;
      const recognized = record?.round ? { round: record.round.round, decisionNo: record.round.decisionNo, decidedOn: record.round.decidedOn, registerNo: record.registerNo } : null;
      const gaps = completionGaps({ academic, conduct, absentDays, failedSubjects, birthYear, reviewYear, dossierComplete, promotionOverride: term?.promotionOverride ?? null });
      return {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
        class: klass,
        academic,
        conduct,
        absentDays,
        failedSubjects,
        age: birthYear === null ? null : reviewYear - birthYear,
        dossierComplete,
        priority: record?.priority ?? null,
        note: record?.note ?? null,
        gaps,
        eligible: !recognized && !gaps.length,
        recognized,
      };
    });
    students.sort((a, b) => a.class.name.localeCompare(b.class.name, 'vi', { numeric: true }) || a.fullName.localeCompare(b.fullName, 'vi'));
    return { year: { id: year.id, name: year.name, reviewYear }, students };
  }

  /** The review page: the round's council and decision, both rounds' state and every candidate. */
  async overview(schoolId: string, round = 1, classId?: string) {
    const { year, students } = await this.candidates(schoolId, { classId });
    const { first, second } = await this.rounds(year.id);
    const row = round === 1 ? first : second;
    const fallback = round === 2 && first ? (first.members as unknown as CouncilMember[]) : [];
    const recognizedIn = (r: number) => students.filter((s) => s.recognized?.round === r).length;
    return {
      academicYear: year,
      round: this.view(round, row, fallback),
      rounds: [first, second].map((r, i) => ({ round: i + 1, decisionNo: r?.decisionNo ?? null, decidedOn: r?.decidedOn ?? null, recognizedAt: r?.recognizedAt ?? null, recognized: recognizedIn(i + 1) })),
      students,
      summary: {
        students: students.length,
        eligible: students.filter((s) => s.eligible).length,
        notEligible: students.filter((s) => !s.recognized && s.gaps.length).length,
        recognized: students.filter((s) => s.recognized).length,
      },
    };
  }

  /** The council, its meeting and members for a round (the office prepares it before the meeting). */
  async saveCouncil(user: AuthUser, round: number, dto: CouncilDto) {
    const year = await this.years.current(user.schoolId);
    const data: Omit<Prisma.CompletionRoundUncheckedCreateInput, 'schoolId' | 'academicYearId' | 'round'> = {};
    if (dto.councilDecisionNo !== undefined) data.councilDecisionNo = dto.councilDecisionNo?.trim() || null;
    if (dto.councilDecidedOn !== undefined) data.councilDecidedOn = dto.councilDecidedOn ? new Date(dto.councilDecidedOn.slice(0, 10)) : null;
    if (dto.meetingAt !== undefined) data.meetingAt = dto.meetingAt ? new Date(dto.meetingAt) : null;
    if (dto.meetingPlace !== undefined) data.meetingPlace = dto.meetingPlace?.trim() || null;
    if (dto.members !== undefined) data.members = dto.members.map((m: CouncilMemberDto) => ({ name: m.name.trim(), position: m.position?.trim() || undefined, role: m.role.trim() })) as unknown as Prisma.InputJsonValue;
    await this.prisma.completionRound.upsert({
      where: { academicYearId_round: { academicYearId: year.id, round } },
      create: { schoolId: user.schoolId, academicYearId: year.id, round, ...data },
      update: data,
    });
    return this.overview(user.schoolId, round);
  }

  /** Dossier, priority group and note of one grade 9 student. */
  async saveStudent(user: AuthUser, studentId: string, dto: CompletionStudentDto) {
    const year = await this.years.current(user.schoolId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: year.id, class: { schoolId: user.schoolId, gradeLevel: COMPLETION_GRADE } },
      select: { classId: true },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy học sinh lớp 9 trong năm học hiện tại');
    const data = {
      ...(dto.dossierComplete !== undefined ? { dossierComplete: dto.dossierComplete } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority?.trim() || null } : {}),
      ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
    };
    await this.prisma.completionRecord.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
      create: { schoolId: user.schoolId, academicYearId: year.id, studentId, classId: enrollment.classId, ...data },
      update: { classId: enrollment.classId, ...data },
    });
    const { students } = await this.candidates(user.schoolId, { studentId });
    return students[0];
  }

  /**
   * Records the recognition decision of a round: every eligible student not yet
   * recognised gets the round and the next number in the register.
   */
  async recognize(user: AuthUser, round: number, dto: RecognizeDto) {
    const { year, students } = await this.candidates(user.schoolId);
    const { first, second } = await this.rounds(year.id);
    const row = round === 1 ? first : second;
    if (row?.recognizedAt) throw new BadRequestException(`Đợt ${round} đã có quyết định công nhận`);
    if (round === 2 && !first?.recognizedAt) throw new BadRequestException('Cần công nhận đợt 1 trước khi xét đợt 2');
    const eligible = students.filter((s) => s.eligible);
    if (!eligible.length) throw new BadRequestException('Không có học sinh đủ điều kiện công nhận');

    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { principalName: true } });
    const members = (row?.members as unknown as CouncilMember[] | undefined) ?? (round === 2 ? ((first?.members as unknown as CouncilMember[]) ?? []) : []);
    const chair = members.find((m) => m.role.toLowerCase() === 'chủ tịch');
    const last = await this.prisma.completionRecord.aggregate({ where: { academicYearId: year.id }, _max: { registerNo: true } });
    const start = (last._max.registerNo ?? 0) + 1;
    const now = new Date();
    // Who the decision leaves out and why: the lists and minutes printed later show the round as it was decided.
    const left: NotRecognized[] = students
      .filter((s) => !s.recognized && s.gaps.length)
      .map((s) => ({ id: s.id, fullName: s.fullName, dateOfBirth: s.dateOfBirth?.toISOString() ?? null, class: s.class, conduct: s.conduct, academic: s.academic, absentDays: s.absentDays, gaps: s.gaps }));
    const decision = {
      decisionNo: dto.decisionNo.trim(),
      decidedOn: new Date(dto.decidedOn.slice(0, 10)),
      signerTitle: dto.signerTitle?.trim() || DEFAULT_DECISION_SIGNER,
      signerName: dto.signerName?.trim() || chair?.name || school.principalName,
      recognizedAt: now,
      recognizedById: user.userId,
      notRecognized: left as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.completionRound.upsert({
        where: { academicYearId_round: { academicYearId: year.id, round } },
        create: { schoolId: user.schoolId, academicYearId: year.id, round, members: members as unknown as Prisma.InputJsonValue, ...decision },
        update: decision,
        select: { id: true },
      });
      for (const [i, s] of eligible.entries()) {
        const data = { roundId: saved.id, registerNo: start + i, recognizedAt: now, classId: s.class.id };
        await tx.completionRecord.upsert({
          where: { studentId_academicYearId: { studentId: s.id, academicYearId: year.id } },
          create: { schoolId: user.schoolId, academicYearId: year.id, studentId: s.id, ...data },
          update: data,
        });
      }
    });
    return { recognized: eligible.length, firstRegisterNo: start };
  }

  /** Withdraws a round's decision (only the latest one), so the list can be corrected and recognised again. */
  async cancel(user: AuthUser, round: number) {
    const year = await this.years.current(user.schoolId);
    const { first, second } = await this.rounds(year.id);
    const row = round === 1 ? first : second;
    if (!row?.recognizedAt) throw new BadRequestException(`Đợt ${round} chưa có quyết định công nhận`);
    if (round === 1 && second?.recognizedAt) throw new BadRequestException('Cần hủy công nhận đợt 2 trước');
    const [records] = await this.prisma.$transaction([
      this.prisma.completionRecord.updateMany({ where: { roundId: row.id }, data: { roundId: null, registerNo: null, recognizedAt: null } }),
      this.prisma.completionRound.update({
        where: { id: row.id },
        data: { decisionNo: null, decidedOn: null, signerTitle: null, signerName: null, recognizedAt: null, recognizedById: null, notRecognized: Prisma.DbNull },
      }),
    ]);
    return { cancelled: records.count };
  }

  /** The round as stored (or its blank defaults) for the printed documents, with whom its decision left out. */
  async round(schoolId: string, round: number) {
    const year = await this.years.current(schoolId);
    const { first, second } = await this.rounds(year.id);
    const row = round === 1 ? first : second;
    return {
      year,
      row: row ? this.view(round, row) : this.view(round, null, round === 2 && first ? (first.members as unknown as CouncilMember[]) : []),
      notRecognized: (row?.notRecognized as unknown as NotRecognized[] | null) ?? null,
    };
  }
}

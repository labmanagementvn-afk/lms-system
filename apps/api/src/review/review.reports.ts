import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AssessmentType, ResultLevel, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { promotionLabel } from '../grades/grades.service';
import { passedLabel, YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { Cell, ReportColumn, ReportDocument, ReportPage, slug, table, text } from '../reports/document';
import { dmy, gender, level, mark, pct, ReportsService, STT } from '../reports/reports.service';
import { ReportQuery } from '../reports/reports.dto';
import { COMPLETION_GRADE, CompletionService, CouncilMember, DEFAULT_DECISION_SIGNER, NotRecognized } from './completion.service';
import { ReviewService } from './review.service';

const GROUP_REVIEW = 'Cuối năm học';
const GROUP_COMPLETION = 'Hoàn thành chương trình THCS';
const PROGRAMME = 'chương trình giáo dục trung học cơ sở';

/** Tốt, Khá, Đạt, Chưa đạt as the short forms the grade 6 to 8 columns use. */
const SHORT: Record<ResultLevel, string> = { TOT: 'T', KHA: 'K', DAT: 'Đ', CHUA_DAT: 'CĐ' };

/** "08 giờ 00, ngày 18/05/2027" in the school's time zone. */
function timeAndDay(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')} giờ ${get('minute')}, ngày ${get('day')}/${get('month')}/${get('year')}`;
}

const memberRole = (members: CouncilMember[], role: string) => members.find((m) => m.role.trim().toLowerCase() === role);

/** A row of the list of students who cannot (or could not) be recognised. */
type NotEligible = Omit<NotRecognized, 'dateOfBirth'> & { dateOfBirth: Date | null };

/**
 * The end-of-year documents: retake and summer training lists, award
 * certificates (giấy khen), and the papers of the THCS completion review
 * (both lists, the council minutes, the decision and the confirmations).
 */
@Injectable()
export class ReviewReports implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly review: ReviewService,
    private readonly completion: CompletionService,
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  onModuleInit() {
    this.reports.register(
      { key: 'retakes', group: GROUP_REVIEW, name: 'Danh sách và kết quả kiểm tra lại', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.retakes(u, q) },
      { key: 'summer-training', group: GROUP_REVIEW, name: 'Danh sách học sinh rèn luyện trong hè', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.training(u, q) },
      { key: 'award-certificates', group: GROUP_REVIEW, name: 'Giấy khen học sinh Xuất sắc, Giỏi', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.awards(u, q) },
      { key: 'completion-proposed', group: GROUP_COMPLETION, name: 'Danh sách đề nghị công nhận hoàn thành chương trình THCS', params: ['round'], required: ['round'], build: (u, q) => this.proposed(u, q) },
      { key: 'completion-not-eligible', group: GROUP_COMPLETION, name: 'Danh sách học sinh chưa đủ điều kiện', params: ['round'], required: ['round'], build: (u, q) => this.notEligible(u, q) },
      { key: 'completion-minutes', group: GROUP_COMPLETION, name: 'Biên bản họp Hội đồng xét công nhận', params: ['round'], required: ['round'], build: (u, q) => this.minutes(u, q) },
      { key: 'completion-decision', group: GROUP_COMPLETION, name: 'Quyết định công nhận hoàn thành chương trình THCS', params: ['round'], required: ['round'], build: (u, q) => this.decision(u, q) },
      { key: 'completion-certificates', group: GROUP_COMPLETION, name: 'Giấy xác nhận hoàn thành chương trình THCS', params: ['classId', 'studentId'], required: [], build: (u, q) => this.confirmations(u, q) },
    );
  }

  private scopeLine(q: ReportQuery, className?: string) {
    return className ? `Lớp ${className}` : q.gradeLevel ? `Khối ${q.gradeLevel}` : 'Toàn trường';
  }

  private school(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, governingBody: true, principalName: true } });
  }

  // ---- retakes and summer training ----

  private async retakes(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const r = await this.review.retakes(user.schoolId, { classId: q.classId, gradeLevel: q.gradeLevel });
    const rows: Cell[][] = [];
    let n = 0;
    for (const s of r.students) {
      // Students not registered yet print the subjects they would retake.
      const subjects = s.retakes.length
        ? s.retakes.map((x) => ({ name: x.name, year: x.assessment === AssessmentType.COMMENT ? passedLabel(x.yearPassed) : mark(x.yearAverage), retake: x.assessment === AssessmentType.COMMENT ? passedLabel(x.passed) : mark(x.score), note: x.note ?? '' }))
        : s.eligible.map((x) => ({ name: x.name, year: x.assessment === AssessmentType.COMMENT ? passedLabel(x.passed) : mark(x.average), retake: '', note: 'Chưa đăng ký' }));
      n++;
      subjects.forEach((x, i) => {
        const first = i === 0;
        rows.push([
          first ? n : '',
          first ? s.fullName : '',
          first ? s.class.name : '',
          x.name,
          x.year ?? '',
          x.retake ?? '',
          first ? level(s.academicAfterRetake) : '',
          first ? (s.reason === 'COMPLETION' ? 'Hoàn thành chương trình THCS' : promotionLabel(s.promotion, s.academic, s.conduct)) : '',
          x.note,
        ]);
      });
    }
    const className = q.classId ? r.students[0]?.class.name : undefined;
    return {
      fileName: slug(`kiem-tra-lai-${className ?? (q.gradeLevel ? `khoi-${q.gradeLevel}` : 'toan-truong')}`),
      title: 'Danh sách học sinh kiểm tra lại',
      subtitles: [`Năm học ${r.academicYear.name}`, this.scopeLine(q, className)],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Họ và tên', width: 2.4 },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Môn kiểm tra lại', width: 1.8 },
            { header: 'Cả năm', width: 0.8, align: 'center', group: 'Điểm, kết quả' },
            { header: 'Kiểm tra lại', width: 0.9, align: 'center', group: 'Điểm, kết quả' },
            { header: 'Học tập sau KTL', width: 1, align: 'center' },
            { header: 'Xét lên lớp', width: 1.4, align: 'center' },
            { header: 'Ghi chú', width: 1.5 },
          ],
          rows,
        ),
        text(
          [
            `Tổng số: ${r.summary.students} học sinh, ${r.summary.subjects} lượt môn đã đăng ký, ${r.summary.entered} lượt đã có kết quả. Lên lớp sau kiểm tra lại: ${r.summary.promoted}; ở lại lớp: ${r.summary.retained}.`,
          ],
          { italic: true },
        ),
      ],
    };
  }

  private async training(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const r = await this.review.trainings(user.schoolId, { classId: q.classId, gradeLevel: q.gradeLevel });
    const className = q.classId ? r.students[0]?.class.name : undefined;
    return {
      fileName: slug(`ren-luyen-he-${className ?? (q.gradeLevel ? `khoi-${q.gradeLevel}` : 'toan-truong')}`),
      title: 'Danh sách học sinh rèn luyện trong hè',
      subtitles: [`Năm học ${r.academicYear.name}`, this.scopeLine(q, className)],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Họ và tên', width: 2.3 },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Học tập', width: 0.8, align: 'center', group: 'Kết quả cả năm' },
            { header: 'Rèn luyện', width: 0.8, align: 'center', group: 'Kết quả cả năm' },
            { header: 'Nhiệm vụ rèn luyện trong hè', width: 4 },
            { header: 'Đánh giá lại', width: 0.9, align: 'center' },
            { header: 'Xét lên lớp', width: 1.2, align: 'center' },
          ],
          r.students.map((s, i) => [i + 1, s.fullName, s.class.name, level(s.academic), level(s.conduct), s.training?.tasks ?? 'Chưa giao', level(s.training?.result ?? null), promotionLabel(s.promotion, s.academic, s.conduct)]),
        ),
        text([`Tổng số: ${r.summary.students} học sinh; đã giao nhiệm vụ ${r.summary.assigned}, đã đánh giá lại ${r.summary.evaluated}. Lên lớp sau rèn luyện hè: ${r.summary.promoted}; ở lại lớp: ${r.summary.retained}.`], { italic: true }),
      ],
    };
  }

  // ---- giấy khen ----

  /** One certificate per student with a year title (Điều 15 TT22: the principal awards Học sinh Xuất sắc and Học sinh Giỏi). */
  private async awards(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.years.current(user.schoolId);
    const school = await this.school(user.schoolId);
    const rows = await this.prisma.termResult.findMany({
      where: {
        academicYearId: year.id,
        semester: YEAR,
        title: { not: null },
        student: { status: StudentStatus.STUDYING },
        class: { schoolId: user.schoolId, ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}), ...(q.classId ? { id: q.classId } : {}) },
      },
      select: { title: true, class: { select: { name: true, gradeLevel: true } }, student: { select: { fullName: true, dateOfBirth: true } } },
    });
    rows.sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.class.name.localeCompare(b.class.name, 'vi', { numeric: true }) || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    const number = (i: number) => `${i + 1}/GK`;
    const pages: ReportPage[] = rows.map((r, i) => ({
      title: '',
      blocks: [
        text([`HIỆU TRƯỞNG ${school.name.toUpperCase()}`], { bold: true, align: 'center', size: 15 }),
        text(['TẶNG'], { bold: true, align: 'center', size: 15 }),
        text(['GIẤY KHEN'], { bold: true, align: 'center', size: 36 }),
        text([`Em: ${r.student.fullName}`], { bold: true, align: 'center', size: 20 }),
        text([`Học sinh lớp ${r.class.name}${r.student.dateOfBirth ? `, sinh ngày ${dmy(r.student.dateOfBirth)}` : ''}`], { align: 'center', size: 14 }),
        text([`Đã đạt danh hiệu ${r.title} năm học ${year.name}`], { bold: true, italic: true, align: 'center', size: 16 }),
      ],
      footnote: [`Số vào sổ: ${number(i)}`],
    }));
    const className = q.classId ? rows[0]?.class.name : undefined;
    return {
      fileName: slug(`giay-khen-${className ?? (q.gradeLevel ? `khoi-${q.gradeLevel}` : 'toan-truong')}-${year.name}`),
      title: 'Danh sách học sinh được tặng giấy khen',
      subtitles: [`Năm học ${year.name}`, this.scopeLine(q, className), 'Bản PDF in mỗi học sinh một giấy khen (khổ A4 ngang).'],
      orientation: 'landscape',
      pdf: 'pages',
      blocks: [
        table(
          [STT, { header: 'Số vào sổ', width: 0.8, align: 'center' }, { header: 'Họ và tên', width: 2.4 }, { header: 'Ngày sinh', width: 1, align: 'center' }, { header: 'Lớp', width: 0.6, align: 'center' }, { header: 'Danh hiệu', width: 1.8 }],
          rows.map((r, i) => [i + 1, number(i), r.student.fullName, dmy(r.student.dateOfBirth), r.class.name, r.title]),
        ),
      ],
      pages,
    };
  }

  // ---- THCS completion ----

  /** The round's council and the candidates of the review, with the students it proposes (or recognised) and those it cannot. */
  private async completionData(user: AuthUser, round: number) {
    const [{ year, students }, { row, notRecognized }, school] = await Promise.all([this.completion.candidates(user.schoolId), this.completion.round(user.schoolId, round), this.school(user.schoolId)]);
    const recognized = !!row.recognizedAt;
    if (round === 2) {
      const first = await this.completion.round(user.schoolId, 1);
      if (!first.row.recognizedAt && !recognized) throw new BadRequestException('Đợt 2 chỉ xét sau khi đợt 1 đã có quyết định công nhận');
    }
    // Before the decision the lists are what the council will be asked to approve; after it, what it approved
    // and whom it left out as they stood then (a retake passed in the summer does not rewrite round 1).
    const proposed = recognized ? students.filter((s) => s.recognized?.round === round) : students.filter((s) => s.eligible);
    const notEligible: NotEligible[] =
      recognized && notRecognized ? notRecognized.map((s) => ({ ...s, dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : null })) : students.filter((s) => !s.recognized && s.gaps.length);
    const chair = memberRole(row.members, 'chủ tịch');
    const secretary = memberRole(row.members, 'thư ký');
    return { year, school, row, recognized, students, proposed, notEligible, chair, secretary };
  }

  /** Grade 6 to 8 results (rèn luyện / học tập) of the candidates from earlier years, when the school has them. */
  private async history(studentIds: string[], academicYearId: string) {
    const rows = await this.prisma.termResult.findMany({
      where: { studentId: { in: studentIds }, semester: YEAR, academicYearId: { not: academicYearId }, class: { gradeLevel: { in: [6, 7, 8] } } },
      select: { studentId: true, conduct: true, academic: true, class: { select: { gradeLevel: true } } },
    });
    const of = (studentId: string, grade: number) => {
      const r = rows.find((x) => x.studentId === studentId && x.class.gradeLevel === grade);
      return r ? `${r.conduct ? SHORT[r.conduct] : '-'}/${r.academic ? SHORT[r.academic] : '-'}` : '';
    };
    return { any: rows.length > 0, of };
  }

  private councilSigners(d: { chair?: CouncilMember; school: { principalName: string | null } }) {
    return {
      signer: { title: 'Chủ tịch Hội đồng', name: d.chair?.name ?? d.school.principalName },
      cosigner: { title: 'Người lập danh sách' },
    };
  }

  private async proposed(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const round = q.round!;
    const d = await this.completionData(user, round);
    const h = await this.history(d.proposed.map((s) => s.id), d.year.id);
    const historyColumns: ReportColumn[] = h.any ? [6, 7, 8].map((g) => ({ header: `Lớp ${g}`, width: 0.6, align: 'center' as const, group: 'RL/HT các năm' })) : [];
    return {
      fileName: slug(`danh-sach-de-nghi-cong-nhan-hoan-thanh-thcs-dot-${round}-${d.year.name}`),
      title: `Danh sách học sinh đề nghị công nhận hoàn thành ${PROGRAMME}`,
      subtitles: [`Năm học ${d.year.name}, đợt ${round}`, ...(d.recognized ? [`Đã được công nhận theo Quyết định số ${d.row.decisionNo} ngày ${dmy(d.row.decidedOn)}`] : [])],
      // Both lists go with the minutes of the meeting.
      date: d.row.meetingAt ?? undefined,
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Họ và tên', width: 2.3 },
            { header: 'Ngày sinh', width: 1, align: 'center' },
            { header: 'Giới tính', width: 0.7, align: 'center' },
            { header: 'Lớp', width: 0.6, align: 'center' },
            ...historyColumns,
            { header: 'Rèn luyện', width: 0.8, align: 'center', group: 'Lớp 9' },
            { header: 'Học tập', width: 0.8, align: 'center', group: 'Lớp 9' },
            { header: 'Nghỉ (buổi)', width: 0.7, align: 'center', group: 'Lớp 9' },
            { header: 'Diện ưu tiên', width: 1.4 },
            { header: 'Ghi chú', width: 1.4 },
          ],
          d.proposed.map((s, i) => [
            i + 1,
            s.fullName,
            dmy(s.dateOfBirth),
            gender(s.gender),
            s.class.name,
            ...(h.any ? [h.of(s.id, 6), h.of(s.id, 7), h.of(s.id, 8)] : []),
            level(s.conduct),
            level(s.academic),
            s.absentDays,
            s.priority ?? '',
            s.note ?? '',
          ]),
        ),
        text([`Danh sách có ${d.proposed.length} học sinh${d.students.length ? `, bằng ${pct(d.proposed.length, d.students.length)} số học sinh lớp ${COMPLETION_GRADE}` : ''}.`], { italic: true }),
      ],
      ...this.councilSigners(d),
    };
  }

  private async notEligible(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const round = q.round!;
    const d = await this.completionData(user, round);
    return {
      fileName: slug(`danh-sach-chua-du-dieu-kien-hoan-thanh-thcs-dot-${round}-${d.year.name}`),
      title: `Danh sách học sinh chưa đủ điều kiện công nhận hoàn thành ${PROGRAMME}`,
      subtitles: [`Năm học ${d.year.name}, đợt ${round}`],
      date: d.row.meetingAt ?? undefined,
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Họ và tên', width: 2.3 },
            { header: 'Ngày sinh', width: 1, align: 'center' },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Rèn luyện', width: 0.8, align: 'center' },
            { header: 'Học tập', width: 0.8, align: 'center' },
            { header: 'Nghỉ (buổi)', width: 0.7, align: 'center' },
            { header: 'Lý do chưa đủ điều kiện', width: 3.6 },
          ],
          d.notEligible.map((s, i) => [i + 1, s.fullName, dmy(s.dateOfBirth), s.class.name, level(s.conduct), level(s.academic), s.absentDays, s.gaps.join('; ')]),
        ),
        text([`Danh sách có ${d.notEligible.length} học sinh. Nhà trường thông báo lý do và hướng dẫn học sinh hoàn thiện để được xét ở đợt sau.`], { italic: true }),
      ],
      ...this.councilSigners(d),
    };
  }

  private async minutes(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const round = q.round!;
    const d = await this.completionData(user, round);
    const members = d.row.members;
    const opening = [
      `Thời gian: ${d.row.meetingAt ? timeAndDay(d.row.meetingAt) : '........ giờ ........, ngày ......../......../........'}.`,
      `Địa điểm: ${d.row.meetingPlace ?? d.school.name}.`,
      ...(d.row.councilDecisionNo
        ? [`Thực hiện Quyết định số ${d.row.councilDecisionNo}${d.row.councilDecidedOn ? ` ngày ${dmy(d.row.councilDecidedOn)}` : ''} của Hiệu trưởng ${d.school.name} về việc thành lập Hội đồng xét công nhận hoàn thành ${PROGRAMME} năm học ${d.year.name}.`]
        : []),
    ];
    const total = d.proposed.length + d.notEligible.length;
    return {
      fileName: slug(`bien-ban-hop-hoi-dong-xet-hoan-thanh-thcs-dot-${round}-${d.year.name}`),
      title: `Biên bản họp Hội đồng xét công nhận hoàn thành ${PROGRAMME}`,
      subtitles: [`Năm học ${d.year.name}, đợt ${round}`],
      dateAtTop: true,
      date: d.row.meetingAt ?? undefined,
      blocks: [
        text(opening),
        table(
          [STT, { header: 'Họ và tên', width: 2.4 }, { header: 'Chức vụ', width: 2 }, { header: 'Nhiệm vụ trong Hội đồng', width: 1.6 }],
          members.map((m, i) => [i + 1, m.name, m.position ?? '', m.role]),
          'I. Thành phần: các thành viên Hội đồng',
        ),
        text(['II. Nội dung'], { bold: true }),
        text(
          [
            `Hội đồng đã xem xét hồ sơ, kết quả rèn luyện và học tập năm học lớp ${COMPLETION_GRADE} của ${total} học sinh theo Điều 12 Thông tư số 22/2021/TT-BGDĐT và hướng dẫn của Sở Giáo dục và Đào tạo; mỗi học sinh được xét các điều kiện: kết quả rèn luyện, học tập cả năm từ mức Đạt trở lên, không có môn học đánh giá mức Chưa đạt, nghỉ học không quá 45 buổi, tuổi và hồ sơ.`,
            `Số học sinh đủ điều kiện, đề nghị công nhận hoàn thành ${PROGRAMME}: ${d.proposed.length} học sinh (${pct(d.proposed.length, total) || '0%'}), theo Danh sách 1 kèm theo.`,
            `Số học sinh chưa đủ điều kiện: ${d.notEligible.length} học sinh, theo Danh sách 2 kèm theo.`,
          ],
          { align: 'justify' },
        ),
        text(['III. Kết luận'], { bold: true }),
        text(
          [
            `Hội đồng thống nhất đề nghị công nhận hoàn thành ${PROGRAMME} năm học ${d.year.name} cho ${d.proposed.length} học sinh có tên trong Danh sách 1.`,
            'Biên bản đã được thông qua trước Hội đồng và kết thúc cùng ngày.',
          ],
          { align: 'justify' },
        ),
      ],
      signer: { title: 'Chủ tịch Hội đồng', name: d.chair?.name ?? d.school.principalName, hint: '(Ký, ghi rõ họ tên)' },
      cosigner: { title: 'Thư ký', name: d.secretary?.name },
    };
  }

  private async decision(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const round = q.round!;
    const d = await this.completionData(user, round);
    if (!d.recognized) throw new BadRequestException(`Đợt ${round} chưa có quyết định công nhận`);
    const signerTitle = d.row.signerTitle ?? DEFAULT_DECISION_SIGNER;
    const signer = { title: signerTitle, name: d.row.signerName };
    const issuer = signerTitle === DEFAULT_DECISION_SIGNER ? `CHỦ TỊCH HỘI ĐỒNG XÉT CÔNG NHẬN HOÀN THÀNH ${PROGRAMME.toUpperCase()}` : `${signerTitle.toUpperCase()} ${d.school.name.toUpperCase()}`;
    const decisionRef = `Quyết định số ${d.row.decisionNo} ngày ${dmy(d.row.decidedOn)}`;
    const grounds = [
      'Căn cứ Luật Giáo dục số 43/2019/QH14 được sửa đổi, bổ sung bởi Luật số 123/2025/QH15;',
      'Căn cứ Thông tư số 22/2021/TT-BGDĐT ngày 20/7/2021 của Bộ trưởng Bộ Giáo dục và Đào tạo quy định về đánh giá học sinh trung học cơ sở và học sinh trung học phổ thông;',
      ...(d.row.councilDecisionNo
        ? [`Căn cứ Quyết định số ${d.row.councilDecisionNo}${d.row.councilDecidedOn ? ` ngày ${dmy(d.row.councilDecidedOn)}` : ''} của Hiệu trưởng ${d.school.name} về việc thành lập Hội đồng xét công nhận hoàn thành ${PROGRAMME} năm học ${d.year.name};`]
        : []),
      ...(d.row.meetingAt ? [`Căn cứ biên bản họp Hội đồng ngày ${dmy(d.row.meetingAt)};`] : []),
      `Xét đề nghị của Hội đồng xét công nhận hoàn thành ${PROGRAMME},`,
    ];
    const list: ReportPage = {
      title: `Danh sách học sinh được công nhận hoàn thành ${PROGRAMME}`,
      subtitles: [`(Kèm theo ${decisionRef})`, `Năm học ${d.year.name}, đợt ${round}`],
      date: d.row.decidedOn ?? undefined,
      blocks: [
        table(
          [
            STT,
            { header: 'Số vào sổ', width: 0.7, align: 'center' },
            { header: 'Họ và tên', width: 2.3 },
            { header: 'Ngày sinh', width: 1, align: 'center' },
            { header: 'Giới tính', width: 0.7, align: 'center' },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Rèn luyện', width: 0.8, align: 'center' },
            { header: 'Học tập', width: 0.8, align: 'center' },
            { header: 'Ghi chú', width: 1.4 },
          ],
          d.proposed.map((s, i) => [i + 1, s.recognized?.registerNo ?? '', s.fullName, dmy(s.dateOfBirth), gender(s.gender), s.class.name, level(s.conduct), level(s.academic), s.priority ?? '']),
        ),
        text([`Danh sách có ${d.proposed.length} học sinh.`], { italic: true }),
      ],
      signer,
    };
    return {
      fileName: slug(`quyet-dinh-cong-nhan-hoan-thanh-thcs-dot-${round}-${d.year.name}`),
      number: `Số: ${d.row.decisionNo}`,
      dateAtTop: true,
      date: d.row.decidedOn ?? undefined,
      title: 'Quyết định',
      subtitles: [`Về việc công nhận hoàn thành ${PROGRAMME} năm học ${d.year.name}`],
      subtitleStyle: 'bold',
      blocks: [
        text([issuer], { bold: true, align: 'center' }),
        text(grounds, { italic: true, align: 'justify' }),
        text(['QUYẾT ĐỊNH:'], { bold: true, align: 'center' }),
        text(
          [
            `Điều 1. Công nhận hoàn thành ${PROGRAMME} năm học ${d.year.name} (đợt ${round}) đối với ${d.proposed.length} học sinh ${d.school.name} (có danh sách kèm theo).`,
            'Điều 2. Hiệu trưởng nhà trường xác nhận vào học bạ của các học sinh có tên tại Điều 1. Quyết định này có hiệu lực kể từ ngày ký.',
            `Điều 3. Các thành viên Hội đồng, giáo viên chủ nhiệm lớp ${COMPLETION_GRADE} và các học sinh có tên tại Điều 1 chịu trách nhiệm thi hành Quyết định này.`,
          ],
          { align: 'justify' },
        ),
      ],
      signer,
      footnote: ['Nơi nhận:', '- Như Điều 3;', `- ${d.school.governingBody ?? 'UBND cấp xã'} (Phòng Văn hóa - Xã hội);`, '- Sở GD&ĐT (Phòng Giáo dục trung học);', '- Lưu: VT, hồ sơ xét công nhận.'],
      pages: [list],
    };
  }

  /** Giấy xác nhận hoàn thành chương trình THCS for recognised students, for grade 10 admission and other uses. */
  private async confirmations(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const [{ year, students }, school] = await Promise.all([this.completion.candidates(user.schoolId, { classId: q.classId, studentId: q.studentId }), this.school(user.schoolId)]);
    if (q.studentId && !students.length) throw new NotFoundException('Không tìm thấy học sinh lớp 9 trong năm học hiện tại');
    // In the order of the register.
    const done = students.filter((s) => s.recognized).sort((a, b) => (a.recognized!.registerNo ?? 0) - (b.recognized!.registerNo ?? 0));
    if (q.studentId && !done.length) throw new BadRequestException('Học sinh chưa được công nhận hoàn thành chương trình THCS');
    const rounds = await this.prisma.completionRound.findMany({ where: { academicYearId: year.id }, select: { round: true, signerTitle: true } });
    const signerOf = (round: number) => rounds.find((r) => r.round === round)?.signerTitle ?? DEFAULT_DECISION_SIGNER;
    const pages: ReportPage[] = done.map((s) => ({
      number: `Số: ${s.recognized!.registerNo ?? ''}/GXN`,
      title: 'Giấy xác nhận',
      subtitles: [`Hoàn thành ${PROGRAMME}`],
      subtitleStyle: 'bold',
      blocks: [
        text([`HIỆU TRƯỞNG ${school.name.toUpperCase()} XÁC NHẬN:`], { bold: true, align: 'center' }),
        {
          type: 'fields',
          fields: [
            ['Họ và tên', s.fullName],
            ['Giới tính', gender(s.gender)],
            ['Ngày sinh', dmy(s.dateOfBirth)],
            ['Mã học sinh', s.code],
            ['Học sinh lớp', s.class.name],
            ['Năm học', year.name],
          ],
        },
        text(
          [
            `Đã hoàn thành ${PROGRAMME} năm học ${year.name}, theo Quyết định số ${s.recognized!.decisionNo} ngày ${dmy(s.recognized!.decidedOn)} của ${signerOf(s.recognized!.round)} xét công nhận hoàn thành ${PROGRAMME} ${school.name}.`,
            `Kết quả năm học lớp ${COMPLETION_GRADE}: rèn luyện ${level(s.conduct)}, học tập ${level(s.academic)}.`,
            'Giấy xác nhận này cấp cho học sinh để sử dụng khi tuyển sinh vào lớp 10 và các thủ tục khác theo quy định.',
          ],
          { align: 'justify' },
        ),
      ],
    }));
    const className = q.classId ? students[0]?.class.name : undefined;
    return {
      fileName: slug(q.studentId && done[0] ? `giay-xac-nhan-hoan-thanh-thcs-${done[0].code}` : `giay-xac-nhan-hoan-thanh-thcs-${className ?? 'khoi-9'}-${year.name}`),
      title: `Danh sách giấy xác nhận hoàn thành ${PROGRAMME}`,
      subtitles: [`Năm học ${year.name}`, className ? `Lớp ${className}` : `Khối ${COMPLETION_GRADE}`, 'Bản PDF in mỗi học sinh một giấy xác nhận.'],
      pdf: 'pages',
      blocks: [
        table(
          [STT, { header: 'Số', width: 0.6, align: 'center' }, { header: 'Họ và tên', width: 2.4 }, { header: 'Ngày sinh', width: 1, align: 'center' }, { header: 'Lớp', width: 0.6, align: 'center' }, { header: 'Quyết định công nhận', width: 2.2 }],
          done.map((s, i) => [i + 1, s.recognized!.registerNo ?? '', s.fullName, dmy(s.dateOfBirth), s.class.name, `Số ${s.recognized!.decisionNo} ngày ${dmy(s.recognized!.decidedOn)}`]),
        ),
      ],
      pages,
    };
  }
}

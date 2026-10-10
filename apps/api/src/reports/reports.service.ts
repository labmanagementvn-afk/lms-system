import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentType, Gender, GuardianRelationship, HomeroomStatus, PromotionStatus, ResultLevel, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { GradeControlService } from '../grades/control.service';
import { GradesService, LEVEL_LABEL, PROMOTION_LABEL } from '../grades/grades.service';
import { orderSubjects } from '../grades/results';
import { formatMark, passedLabel, TITLE_EXCELLENT, TITLE_GOOD, YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { Cell, Letterhead, ReportColumn, ReportDocument, slug, table, text } from './document';
import { ReportQuery } from './reports.dto';

export type ReportParam = 'classId' | 'subjectId' | 'studentId' | 'semester' | 'term' | 'gradeLevel' | 'from' | 'to' | 'status' | 'promotion';

export interface ReportDef {
  key: string;
  group: string;
  name: string;
  /** Parameters the form asks for; those in `required` must be set. */
  params: ReportParam[];
  required: ReportParam[];
  /** Who may run it; every portal role when unset. */
  roles?: Role[];
  build: (user: AuthUser, q: ReportQuery) => Promise<ReportDocument>;
}

const GROUP_STUDENTS = 'Hồ sơ học sinh';
const GROUP_RESULTS = 'Kết quả học tập';
const GROUP_GRADEBOOK = 'Quản lý sổ điểm';
const OFFICE: Role[] = [Role.ADMIN, Role.STAFF];

const semesterName = (s: number) => (s === YEAR ? 'Cả năm' : s === 1 ? 'Học kỳ I' : 'Học kỳ II');
const mark = (v: number | null | undefined) => (v === null || v === undefined ? '' : formatMark(v));
const gender = (g: Gender | null) => (g === Gender.FEMALE ? 'Nữ' : g === Gender.MALE ? 'Nam' : '');
const dmy = (d: Date | null | undefined) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');
const level = (l: ResultLevel | null) => (l ? LEVEL_LABEL[l] : '');
/** "33,3%": one decimal with a decimal comma, as in the printed forms. */
const pct = (n: number, total: number) => (total ? `${String(Math.round((n / total) * 1000) / 10).replace('.', ',')}%` : '');
const STT: ReportColumn = { header: 'STT', width: 0.5, align: 'center' };

const STATUS_TITLE: Record<StudentStatus, string> = {
  STUDYING: 'Danh sách học sinh đang học',
  TRANSFERRED: 'Danh sách học sinh chuyển trường',
  DROPPED: 'Danh sách học sinh thôi học',
  GRADUATED: 'Danh sách học sinh đã tốt nghiệp',
};

/** Score bands of the "thống kê điểm" report, lowest first. */
export const SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: '0 - 3,4', min: 0, max: 3.4 },
  { label: '3,5 - 4,9', min: 3.5, max: 4.9 },
  { label: '5,0 - 6,4', min: 5, max: 6.4 },
  { label: '6,5 - 7,9', min: 6.5, max: 7.9 },
  { label: '8,0 - 10', min: 8, max: 10 },
];

/**
 * Official reports (báo cáo) as data: the catalogue, and each report built
 * into a ReportDocument that the controller renders to PDF or Excel.
 */
@Injectable()
export class ReportsService {
  readonly defs: ReportDef[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly grades: GradesService,
    private readonly control: GradeControlService,
  ) {
    this.defs = [
      { key: 'class-list', group: GROUP_STUDENTS, name: 'Danh sách học sinh lớp', params: ['classId'], required: ['classId'], build: (u, q) => this.classList(u, q) },
      { key: 'students-by-status', group: GROUP_STUDENTS, name: 'Danh sách học sinh chuyển trường / thôi học', params: ['status', 'gradeLevel'], required: ['status'], build: (u, q) => this.byStatus(u, q) },
      { key: 'student-stats', group: GROUP_STUDENTS, name: 'Thống kê số liệu học sinh', params: [], required: [], build: (u) => this.studentStats(u) },
      { key: 'absences', group: GROUP_STUDENTS, name: 'Thống kê học sinh nghỉ học', params: ['from', 'to', 'classId'], required: ['from', 'to'], build: (u, q) => this.absences(u, q) },
      { key: 'exemptions', group: GROUP_STUDENTS, name: 'Danh sách học sinh miễn học', params: ['classId'], required: [], build: (u, q) => this.exemptions(u, q) },
      { key: 'subject-scores', group: GROUP_RESULTS, name: 'Bảng điểm môn học', params: ['classId', 'subjectId', 'semester'], required: ['classId', 'subjectId', 'semester'], build: (u, q) => this.subjectScores(u, q) },
      { key: 'class-results', group: GROUP_RESULTS, name: 'Bảng điểm tổng hợp', params: ['classId', 'term'], required: ['classId', 'term'], build: (u, q) => this.classResults(u, q) },
      { key: 'score-distribution', group: GROUP_RESULTS, name: 'Thống kê điểm môn học', params: ['subjectId', 'term', 'gradeLevel'], required: ['subjectId', 'term'], build: (u, q) => this.scoreDistribution(u, q) },
      { key: 'level-stats', group: GROUP_RESULTS, name: 'Thống kê kết quả học tập, rèn luyện', params: ['term', 'gradeLevel'], required: ['term'], build: (u, q) => this.levelStats(u, q) },
      { key: 'titles', group: GROUP_RESULTS, name: 'Danh sách khen thưởng cuối năm', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.titles(u, q) },
      { key: 'promotion', group: GROUP_RESULTS, name: 'Danh sách học sinh kiểm tra lại / ở lại lớp', params: ['promotion', 'gradeLevel'], required: ['promotion'], build: (u, q) => this.promotion(u, q) },
      { key: 'transcript', group: GROUP_RESULTS, name: 'Học bạ (kết quả học tập năm học)', params: ['studentId'], required: ['studentId'], build: (u, q) => this.transcript(u, q) },
      { key: 'entry-monitoring', group: GROUP_GRADEBOOK, name: 'Giám sát nhập điểm', params: ['semester', 'gradeLevel'], required: ['semester'], roles: OFFICE, build: (u, q) => this.entryMonitoring(u, q) },
      { key: 'missing-scores', group: GROUP_GRADEBOOK, name: 'Danh sách học sinh thiếu điểm', params: ['classId', 'semester'], required: ['classId', 'semester'], build: (u, q) => this.missingScores(u, q) },
      { key: 'score-edits', group: GROUP_GRADEBOOK, name: 'Thống kê sửa điểm', params: ['semester', 'classId', 'subjectId'], required: ['semester'], roles: OFFICE, build: (u, q) => this.scoreEdits(u, q) },
    ];
  }

  /** The reports this user may run. */
  catalogue(user: AuthUser) {
    return this.defs.filter((d) => !d.roles || d.roles.includes(user.role)).map(({ key, group, name, params, required }) => ({ key, group, name, params, required }));
  }

  /** Adds more reports (end-of-year flows and other modules register theirs here). */
  register(...defs: ReportDef[]) {
    for (const d of defs) {
      if (this.defs.some((x) => x.key === d.key)) throw new Error(`Report ${d.key} registered twice`);
      this.defs.push(d);
    }
  }

  async build(user: AuthUser, key: string, q: ReportQuery): Promise<{ document: ReportDocument; letterhead: Letterhead }> {
    const def = this.defs.find((d) => d.key === key);
    if (!def) throw new NotFoundException('Không tìm thấy báo cáo');
    if (def.roles && !def.roles.includes(user.role)) throw new ForbiddenException('Báo cáo này chỉ dành cho cán bộ quản lý của trường');
    const missing = def.required.filter((p) => (p === 'term' ? q.semester === undefined : q[p] === undefined || q[p] === ''));
    if (missing.length) throw new BadRequestException(`Báo cáo cần: ${missing.map((m) => PARAM_LABEL[m]).join(', ')}`);
    if (def.params.includes('semester') && !def.params.includes('term') && q.semester === YEAR) throw new BadRequestException('Báo cáo này chỉ áp dụng cho học kỳ I hoặc II');
    const [document, letterhead] = await Promise.all([def.build(user, q), this.letterhead(user.schoolId, q)]);
    return { document, letterhead };
  }

  async letterhead(schoolId: string, q: Pick<ReportQuery, 'signerTitle' | 'signerName' | 'place'> = {}): Promise<Letterhead> {
    const s = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, governingBody: true, principalName: true, locality: true, province: true } });
    return {
      governingBody: s.governingBody,
      schoolName: s.name,
      place: q.place || s.locality || s.province,
      signerTitle: q.signerTitle || 'Hiệu trưởng',
      signerName: q.signerName || s.principalName,
      date: new Date(),
    };
  }

  // ---- shared lookups ----

  private async yearName(schoolId: string, academicYearId?: string) {
    if (academicYearId) {
      const y = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true, name: true } });
      if (!y) throw new NotFoundException('Không tìm thấy năm học');
      return y;
    }
    const y = await this.years.current(schoolId);
    return { id: y.id, name: y.name };
  }

  private async classOf(schoolId: string, classId: string) {
    const c = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true, gradeLevel: true, academicYear: { select: { id: true, name: true } }, homeroomTeacher: { select: { fullName: true } } } });
    if (!c) throw new NotFoundException('Không tìm thấy lớp');
    return c;
  }

  private async classesOf(schoolId: string, academicYearId: string, gradeLevel?: number, classId?: string) {
    const rows = await this.prisma.class.findMany({
      where: { schoolId, academicYearId, ...(gradeLevel ? { gradeLevel } : {}), ...(classId ? { id: classId } : {}) },
      select: { id: true, name: true, gradeLevel: true },
    });
    return rows.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true }));
  }

  private scopeLine(gradeLevel?: number) {
    return gradeLevel ? `Khối ${gradeLevel}` : 'Toàn trường';
  }

  // ---- Hồ sơ học sinh ----

  private async classList(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const c = await this.classOf(user.schoolId, q.classId!);
    const rows = await this.prisma.enrollment.findMany({
      where: { classId: c.id, student: { status: StudentStatus.STUDYING } },
      select: { student: { select: { code: true, fullName: true, gender: true, dateOfBirth: true, address: true, guardians: { select: { fullName: true, phone: true, relationship: true, isPrimary: true } } } } },
      orderBy: { student: { fullName: 'asc' } },
    });
    const guardian = (gs: { fullName: string; phone: string; isPrimary: boolean; relationship: GuardianRelationship }[]) => gs.find((g) => g.isPrimary) ?? gs[0];
    const female = rows.filter((r) => r.student.gender === Gender.FEMALE).length;
    return {
      fileName: slug(`danh-sach-lop-${c.name}`),
      title: `Danh sách học sinh lớp ${c.name}`,
      subtitles: [`Năm học ${c.academicYear.name}`, ...(c.homeroomTeacher ? [`Giáo viên chủ nhiệm: ${c.homeroomTeacher.fullName}`] : [])],
      orientation: 'landscape',
      blocks: [
        table(
          [STT, { header: 'Mã học sinh', width: 1.3 }, { header: 'Họ và tên', width: 2.4 }, { header: 'Ngày sinh', width: 1.1, align: 'center' }, { header: 'Giới tính', width: 0.8, align: 'center' }, { header: 'Địa chỉ', width: 3 }, { header: 'Phụ huynh', width: 2 }, { header: 'Điện thoại', width: 1.2 }],
          rows.map((r, i) => {
            const g = guardian(r.student.guardians);
            return [i + 1, r.student.code, r.student.fullName, dmy(r.student.dateOfBirth), gender(r.student.gender), r.student.address ?? '', g?.fullName ?? '', g?.phone ?? ''];
          }),
        ),
        text([`Tổng số: ${rows.length} học sinh, trong đó nữ: ${female}.`], { italic: true }),
      ],
    };
  }

  private async byStatus(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const status = q.status!;
    const students = await this.prisma.student.findMany({
      where: { schoolId: user.schoolId, status, ...(q.gradeLevel ? { enrollments: { some: { class: { gradeLevel: q.gradeLevel } } } } : {}) },
      select: { code: true, fullName: true, gender: true, dateOfBirth: true, updatedAt: true, enrollments: { select: { class: { select: { name: true } } }, orderBy: { enrolledAt: 'desc' }, take: 1 } },
      orderBy: { fullName: 'asc' },
    });
    return {
      fileName: slug(STATUS_TITLE[status]),
      title: STATUS_TITLE[status],
      subtitles: [this.scopeLine(q.gradeLevel)],
      blocks: [
        table(
          [STT, { header: 'Mã học sinh', width: 1.3 }, { header: 'Họ và tên', width: 2.5 }, { header: 'Ngày sinh', width: 1.1, align: 'center' }, { header: 'Giới tính', width: 0.8, align: 'center' }, { header: 'Lớp', width: 0.8, align: 'center' }, { header: 'Cập nhật', width: 1.1, align: 'center' }],
          students.map((s, i) => [i + 1, s.code, s.fullName, dmy(s.dateOfBirth), gender(s.gender), s.enrollments[0]?.class.name ?? '', dmy(s.updatedAt)]),
        ),
      ],
    };
  }

  private async studentStats(user: AuthUser): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const classes = await this.classesOf(user.schoolId, year.id);
    const roster = await this.prisma.enrollment.findMany({
      where: { academicYearId: year.id, class: { schoolId: user.schoolId }, student: { status: StudentStatus.STUDYING } },
      select: { classId: true, student: { select: { gender: true } } },
    });
    const count = (classIds: string[]) => {
      const rows = roster.filter((r) => classIds.includes(r.classId));
      const female = rows.filter((r) => r.student.gender === Gender.FEMALE).length;
      return { total: rows.length, female, male: rows.length - female };
    };
    const rows: Cell[][] = [];
    for (const g of [...new Set(classes.map((c) => c.gradeLevel))]) {
      const inGrade = classes.filter((c) => c.gradeLevel === g);
      for (const c of inGrade) {
        const n = count([c.id]);
        rows.push([rows.length + 1, `Lớp ${c.name}`, n.total, n.female, pct(n.female, n.total), n.male]);
      }
      const n = count(inGrade.map((c) => c.id));
      rows.push(['', `Cộng khối ${g} (${inGrade.length} lớp)`, n.total, n.female, pct(n.female, n.total), n.male]);
    }
    const all = count(classes.map((c) => c.id));
    rows.push(['', `Toàn trường (${classes.length} lớp)`, all.total, all.female, pct(all.female, all.total), all.male]);
    return {
      fileName: 'thong-ke-so-lieu-hoc-sinh',
      title: 'Thống kê số liệu học sinh',
      subtitles: [`Năm học ${year.name}`],
      blocks: [table([STT, { header: 'Lớp', width: 2.5 }, { header: 'Tổng số' }, { header: 'Nữ' }, { header: 'Tỉ lệ nữ' }, { header: 'Nam' }], rows)],
    };
  }

  private async absences(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    if (q.from! > q.to!) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const year = await this.yearName(user.schoolId);
    const classes = await this.classesOf(user.schoolId, year.id, undefined, q.classId);
    const records = await this.prisma.homeroomAttendance.findMany({
      where: { schoolId: user.schoolId, classId: { in: classes.map((c) => c.id) }, date: { gte: new Date(`${q.from}T00:00:00Z`), lte: new Date(`${q.to}T00:00:00Z`) }, status: { not: HomeroomStatus.PRESENT } },
      select: { classId: true, status: true, student: { select: { id: true, code: true, fullName: true } } },
    });
    const byStudent = new Map<string, { classId: string; code: string; fullName: string; excused: number; absent: number; late: number }>();
    for (const r of records) {
      const row = byStudent.get(r.student.id) ?? { classId: r.classId, code: r.student.code, fullName: r.student.fullName, excused: 0, absent: 0, late: 0 };
      if (r.status === HomeroomStatus.EXCUSED) row.excused++;
      else if (r.status === HomeroomStatus.ABSENT) row.absent++;
      else if (r.status === HomeroomStatus.LATE) row.late++;
      byStudent.set(r.student.id, row);
    }
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const order = new Map(classes.map((c, i) => [c.id, i]));
    const rows = [...byStudent.values()].sort((a, b) => (order.get(a.classId)! - order.get(b.classId)!) || a.fullName.localeCompare(b.fullName, 'vi'));
    return {
      fileName: slug(`thong-ke-nghi-hoc-${q.from}-${q.to}`),
      title: 'Thống kê học sinh nghỉ học',
      subtitles: [`Từ ngày ${q.from!.split('-').reverse().join('/')} đến ngày ${q.to!.split('-').reverse().join('/')}`, q.classId ? `Lớp ${className.get(q.classId) ?? ''}` : 'Toàn trường'],
      blocks: [
        table(
          [STT, { header: 'Lớp', width: 0.8, align: 'center' }, { header: 'Mã học sinh', width: 1.3 }, { header: 'Họ và tên', width: 2.5 }, { header: 'Có phép', group: 'Số buổi nghỉ' }, { header: 'Không phép', group: 'Số buổi nghỉ' }, { header: 'Tổng', group: 'Số buổi nghỉ' }, { header: 'Đi muộn' }],
          rows.map((r, i) => [i + 1, className.get(r.classId) ?? '', r.code, r.fullName, r.excused, r.absent, r.excused + r.absent, r.late]),
        ),
      ],
    };
  }

  private async exemptions(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const rows = await this.control.exemptions(user.schoolId, { classId: q.classId });
    const classOf = await this.prisma.enrollment.findMany({ where: { academicYearId: year.id, studentId: { in: rows.map((r) => r.student.id) } }, select: { studentId: true, class: { select: { name: true } } } });
    const cls = new Map(classOf.map((c) => [c.studentId, c.class.name]));
    return {
      fileName: 'danh-sach-mien-hoc',
      title: 'Danh sách học sinh miễn học',
      subtitles: [`Năm học ${year.name}`],
      blocks: [
        table(
          [STT, { header: 'Lớp', width: 0.8, align: 'center' }, { header: 'Họ và tên', width: 2.4 }, { header: 'Môn học', width: 1.6 }, { header: 'Thời gian', width: 1, align: 'center' }, { header: 'Lý do', width: 3 }],
          rows.map((r, i) => [i + 1, cls.get(r.student.id) ?? '', r.student.fullName, r.subject.name, semesterName(r.semester), r.reason ?? '']),
        ),
      ],
    };
  }

  // ---- Kết quả học tập ----

  /** Flat headers (Mã HS, TX1.., GK, CK, Ghi chú) so the Excel file can be filled in and imported back. */
  private async subjectScores(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const book = await this.grades.book(user.schoolId, { classId: q.classId!, subjectId: q.subjectId!, semester: q.semester! });
    const c = await this.classOf(user.schoolId, q.classId!);
    const comment = book.setting.assessment === AssessmentType.COMMENT;
    const n = book.setting.regularCount;
    const show = (v: number | null, p: boolean | null) => (comment ? (p === null ? '' : p ? 'Đ' : 'CĐ') : mark(v));
    const columns: ReportColumn[] = [
      STT,
      { header: 'Mã HS', width: 1.4 },
      { header: 'Họ và tên', width: 2.6 },
      ...Array.from({ length: n }, (_, i) => ({ header: `TX${i + 1}`, width: 0.7, align: 'center' as const })),
      { header: 'GK', width: 0.7, align: 'center' },
      { header: 'CK', width: 0.7, align: 'center' },
      { header: comment ? 'Kết quả' : 'ĐTBmhk', width: 0.9, align: 'center' },
      { header: 'Ghi chú', width: 2 },
    ];
    const rows = book.students.map((s, i) =>
      s.exempt
        ? [i + 1, s.code, s.fullName, ...Array.from({ length: n + 3 }, () => 'MG'), 'Miễn học']
        : [i + 1, s.code, s.fullName, ...s.marks.TX.map((v, j) => show(v, s.passed.TX[j])), show(s.marks.GK, s.passed.GK), show(s.marks.CK, s.passed.CK), comment ? (s.passedResult === null ? '' : s.passedResult ? 'Đ' : 'CĐ') : mark(s.average), s.note ?? ''],
    );
    return {
      fileName: slug(`bang-diem-${book.subject.name}-${c.name}-hk${q.semester}`),
      title: `Bảng điểm môn ${book.subject.name} lớp ${c.name}`,
      subtitles: [`${semesterName(q.semester!)}, năm học ${c.academicYear.name}`],
      orientation: n > 4 ? 'landscape' : 'portrait',
      blocks: [table(columns, rows), ...(comment ? [text(['Đ: Đạt; CĐ: Chưa đạt; MG: Miễn học.'], { italic: true })] : [text(['MG: Miễn học.'], { italic: true })])],
    };
  }

  private async classResults(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const r = await this.grades.results(user.schoolId, { classId: q.classId!, semester: q.semester! });
    const c = await this.classOf(user.schoolId, q.classId!);
    const year = q.semester === YEAR;
    const columns: ReportColumn[] = [
      STT,
      { header: 'Họ và tên', width: 2.6 },
      ...r.subjects.map((s) => ({ header: s.name, width: 0.75, align: 'center' as const, group: 'Điểm trung bình / kết quả môn học' })),
      { header: 'Học tập', width: 0.8, align: 'center', group: 'Kết quả' },
      { header: 'Rèn luyện', width: 0.8, align: 'center', group: 'Kết quả' },
      ...(year ? [{ header: 'Danh hiệu', width: 1.1, align: 'center' as const }, { header: 'Lên lớp', width: 1, align: 'center' as const }] : []),
      { header: 'Nghỉ', width: 0.5, align: 'center' },
    ];
    const rows = r.students.map((s, i) => [
      i + 1,
      s.fullName,
      ...s.subjects.map((x) => (x.exempt ? 'MG' : x.assessment === AssessmentType.COMMENT ? (x.passed === null ? '' : x.passed ? 'Đ' : 'CĐ') : mark(x.average))),
      level(s.academic),
      level(s.conduct),
      ...(year ? [s.title?.replace('Học sinh ', '') ?? '', s.promotion ? PROMOTION_LABEL[s.promotion] : ''] : []),
      s.absentDays,
    ]);
    const sum = r.summary;
    return {
      fileName: slug(`bang-diem-tong-hop-${c.name}-${semesterName(q.semester!)}`),
      title: `Bảng điểm tổng hợp lớp ${c.name}`,
      subtitles: [`${semesterName(q.semester!)}, năm học ${c.academicYear.name}`],
      orientation: 'landscape',
      blocks: [
        table(columns, rows),
        text(
          [
            `Học tập: Tốt ${sum.academic.TOT}, Khá ${sum.academic.KHA}, Đạt ${sum.academic.DAT}, Chưa đạt ${sum.academic.CHUA_DAT}. Rèn luyện: Tốt ${sum.conduct.TOT}, Khá ${sum.conduct.KHA}, Đạt ${sum.conduct.DAT}, Chưa đạt ${sum.conduct.CHUA_DAT}.`,
            ...(year ? [`Danh hiệu: ${TITLE_EXCELLENT} ${sum.titles[TITLE_EXCELLENT] ?? 0}, ${TITLE_GOOD} ${sum.titles[TITLE_GOOD] ?? 0}. Lên lớp ${sum.promotion.PROMOTED}, kiểm tra lại ${sum.promotion.RETEST}, ở lại lớp ${sum.promotion.RETAINED}.`] : []),
            'Đ: Đạt; CĐ: Chưa đạt; MG: Miễn học.',
          ],
          { italic: true },
        ),
      ],
    };
  }

  private async scoreDistribution(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const subject = await this.prisma.subject.findFirst({ where: { id: q.subjectId!, schoolId: user.schoolId }, select: { id: true, name: true } });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');
    const setting = await this.prisma.subjectSetting.findUnique({ where: { schoolId_subjectId: { schoolId: user.schoolId, subjectId: subject.id } }, select: { assessment: true } });
    const comment = setting?.assessment === AssessmentType.COMMENT;
    const classes = await this.classesOf(user.schoolId, year.id, q.gradeLevel);
    const results = await this.prisma.subjectResult.findMany({
      where: { academicYearId: year.id, subjectId: subject.id, semester: q.semester!, classId: { in: classes.map((c) => c.id) }, exempt: false, student: { status: StudentStatus.STUDYING } },
      select: { classId: true, average: true, passed: true },
    });
    const bands = comment ? [{ label: 'Đạt' }, { label: 'Chưa đạt' }] : SCORE_BANDS;
    const columns: ReportColumn[] = [STT, { header: 'Lớp', width: 1 }, { header: 'Có kết quả', width: 0.9 }, ...bands.flatMap((b) => [{ header: 'SL', width: 0.6, group: b.label }, { header: '%', width: 0.8, group: b.label }])];
    const bucket = (rows: typeof results) => {
      if (comment) return [rows.filter((r) => r.passed === true).length, rows.filter((r) => r.passed === false).length];
      const values = rows.filter((r) => r.average !== null).map((r) => Number(r.average));
      return SCORE_BANDS.map((b) => values.filter((v) => v >= b.min && v <= b.max).length);
    };
    const line = (label: string, rows: typeof results): Cell[] => {
      const counts = bucket(rows);
      const total = counts.reduce((a, b) => a + b, 0);
      return [label, total, ...counts.flatMap((n) => [n, pct(n, total)])];
    };
    const body: Cell[][] = classes.map((c, i) => [i + 1, ...line(c.name, results.filter((r) => r.classId === c.id))]);
    body.push(['', ...line('Tổng cộng', results)]);
    return {
      fileName: slug(`thong-ke-diem-${subject.name}-${semesterName(q.semester!)}`),
      title: `Thống kê điểm môn ${subject.name}`,
      subtitles: [`${semesterName(q.semester!)}, năm học ${year.name}`, this.scopeLine(q.gradeLevel)],
      orientation: 'landscape',
      blocks: [table(columns, body)],
    };
  }

  private async levelStats(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const classes = await this.classesOf(user.schoolId, year.id, q.gradeLevel);
    const terms = await this.prisma.termResult.findMany({
      where: { academicYearId: year.id, semester: q.semester!, classId: { in: classes.map((c) => c.id) }, student: { status: StudentStatus.STUDYING } },
      select: { classId: true, academic: true, conduct: true },
    });
    const roster = await this.prisma.enrollment.groupBy({ by: ['classId'], where: { classId: { in: classes.map((c) => c.id) }, student: { status: StudentStatus.STUDYING } }, _count: { _all: true } });
    const size = new Map(roster.map((r) => [r.classId, r._count._all]));
    const levels: ResultLevel[] = [ResultLevel.TOT, ResultLevel.KHA, ResultLevel.DAT, ResultLevel.CHUA_DAT];
    const columns: ReportColumn[] = [
      STT,
      { header: 'Lớp', width: 0.9 },
      { header: 'Sĩ số', width: 0.7 },
      ...levels.map((l) => ({ header: LEVEL_LABEL[l], width: 0.75, group: 'Kết quả học tập' })),
      ...levels.map((l) => ({ header: LEVEL_LABEL[l], width: 0.75, group: 'Kết quả rèn luyện' })),
    ];
    const line = (label: string, ids: string[]): Cell[] => {
      const rows = terms.filter((t) => ids.includes(t.classId));
      const total = ids.reduce((a, id) => a + (size.get(id) ?? 0), 0);
      return [label, total, ...levels.map((l) => rows.filter((r) => r.academic === l).length), ...levels.map((l) => rows.filter((r) => r.conduct === l).length)];
    };
    const body: Cell[][] = classes.map((c, i) => [i + 1, ...line(c.name, [c.id])]);
    body.push(['', ...line('Tổng cộng', classes.map((c) => c.id))]);
    return {
      fileName: slug(`thong-ke-hoc-tap-ren-luyen-${semesterName(q.semester!)}`),
      title: 'Thống kê kết quả học tập và rèn luyện',
      subtitles: [`${semesterName(q.semester!)}, năm học ${year.name}`, this.scopeLine(q.gradeLevel)],
      orientation: 'landscape',
      blocks: [table(columns, body)],
    };
  }

  private async titles(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const classes = await this.classesOf(user.schoolId, year.id, q.gradeLevel, q.classId);
    const order = new Map(classes.map((c, i) => [c.id, i]));
    const rows = await this.prisma.termResult.findMany({
      where: { academicYearId: year.id, semester: YEAR, classId: { in: classes.map((c) => c.id) }, title: { not: null }, student: { status: StudentStatus.STUDYING } },
      select: { classId: true, title: true, academic: true, conduct: true, student: { select: { code: true, fullName: true, dateOfBirth: true } } },
    });
    rows.sort((a, b) => (a.title === b.title ? 0 : a.title === TITLE_EXCELLENT ? -1 : 1) || order.get(a.classId)! - order.get(b.classId)! || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    const name = new Map(classes.map((c) => [c.id, c.name]));
    return {
      fileName: 'danh-sach-khen-thuong',
      title: 'Danh sách học sinh được khen thưởng',
      subtitles: [`Cuối năm học ${year.name}`, q.classId ? `Lớp ${name.get(q.classId) ?? ''}` : this.scopeLine(q.gradeLevel)],
      blocks: [
        table(
          [STT, { header: 'Họ và tên', width: 2.6 }, { header: 'Ngày sinh', width: 1.1, align: 'center' }, { header: 'Lớp', width: 0.7, align: 'center' }, { header: 'Học tập', width: 0.8, align: 'center' }, { header: 'Rèn luyện', width: 0.9, align: 'center' }, { header: 'Danh hiệu', width: 1.8 }],
          rows.map((r, i) => [i + 1, r.student.fullName, dmy(r.student.dateOfBirth), name.get(r.classId) ?? '', level(r.academic), level(r.conduct), r.title ?? '']),
        ),
        text([`Tổng số: ${rows.filter((r) => r.title === TITLE_EXCELLENT).length} ${TITLE_EXCELLENT}, ${rows.filter((r) => r.title === TITLE_GOOD).length} ${TITLE_GOOD}.`], { italic: true }),
      ],
    };
  }

  private async promotion(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const classes = await this.classesOf(user.schoolId, year.id, q.gradeLevel);
    const order = new Map(classes.map((c, i) => [c.id, i]));
    const name = new Map(classes.map((c) => [c.id, c.name]));
    const rows = await this.prisma.termResult.findMany({
      where: { academicYearId: year.id, semester: YEAR, classId: { in: classes.map((c) => c.id) }, promotion: q.promotion!, student: { status: StudentStatus.STUDYING } },
      select: { classId: true, academic: true, conduct: true, absentDays: true, student: { select: { code: true, fullName: true } } },
    });
    rows.sort((a, b) => order.get(a.classId)! - order.get(b.classId)! || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    const reason = (r: (typeof rows)[number]) => [r.absentDays > 45 ? `nghỉ ${r.absentDays} buổi` : '', r.academic === ResultLevel.CHUA_DAT ? 'học tập Chưa đạt' : '', r.conduct === ResultLevel.CHUA_DAT ? 'rèn luyện Chưa đạt' : ''].filter(Boolean).join(', ');
    const title = q.promotion === PromotionStatus.RETAINED ? 'Danh sách học sinh ở lại lớp' : q.promotion === PromotionStatus.RETEST ? 'Danh sách học sinh kiểm tra lại, rèn luyện trong hè' : 'Danh sách học sinh được lên lớp';
    return {
      fileName: slug(title),
      title,
      subtitles: [`Năm học ${year.name}`, this.scopeLine(q.gradeLevel)],
      blocks: [
        table(
          [STT, { header: 'Họ và tên', width: 2.6 }, { header: 'Lớp', width: 0.7, align: 'center' }, { header: 'Học tập', width: 0.9, align: 'center', group: 'Kết quả' }, { header: 'Rèn luyện', width: 0.9, align: 'center', group: 'Kết quả' }, { header: 'Số buổi nghỉ', width: 0.8 }, { header: 'Lý do', width: 2.4 }],
          rows.map((r, i) => [i + 1, r.student.fullName, name.get(r.classId) ?? '', level(r.academic), level(r.conduct), r.absentDays, reason(r)]),
        ),
      ],
    };
  }

  private async transcript(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const t = await this.grades.transcript(user.schoolId, q.studentId!, q.academicYearId);
    const cell = (assessment: AssessmentType, c: { average: number | null; passed: boolean | null; exempt: boolean }) => (c.exempt ? 'MG' : assessment === AssessmentType.COMMENT ? (passedLabel(c.passed) ?? '') : mark(c.average));
    const term = (x: { academic: ResultLevel | null; conduct: ResultLevel | null } | null) => [level(x?.academic ?? null), level(x?.conduct ?? null)];
    const subjects = orderSubjects(t.subjects);
    return {
      fileName: slug(`hoc-ba-${t.student.code}-${t.academicYear.name}`),
      title: 'Kết quả học tập và rèn luyện',
      subtitles: [`Năm học ${t.academicYear.name}`],
      blocks: [
        { type: 'fields', fields: [['Họ và tên', t.student.fullName], ['Mã học sinh', t.student.code], ['Ngày sinh', dmy(t.student.dateOfBirth)], ['Giới tính', gender(t.student.gender)], ['Lớp', t.class?.name ?? ''], ['Giáo viên chủ nhiệm', t.homeroomTeacher?.fullName ?? '']] },
        table(
          [STT, { header: 'Môn học và hoạt động giáo dục', width: 3 }, { header: 'Học kỳ I', width: 1, align: 'center' }, { header: 'Học kỳ II', width: 1, align: 'center' }, { header: 'Cả năm', width: 1, align: 'center' }],
          subjects.map((s, i) => [i + 1, s.name, cell(s.assessment, s.hk1), cell(s.assessment, s.hk2), cell(s.assessment, s.year)]),
        ),
        table(
          [{ header: '', width: 2 }, { header: 'Học tập', width: 1, align: 'center' }, { header: 'Rèn luyện', width: 1, align: 'center' }, { header: 'Nghỉ (buổi)', width: 1, align: 'center' }],
          [
            ['Học kỳ I', ...term(t.terms.hk1), t.terms.hk1?.absentDays ?? 0],
            ['Học kỳ II', ...term(t.terms.hk2), t.terms.hk2?.absentDays ?? 0],
            ['Cả năm', ...term(t.terms.year), t.terms.year?.absentDays ?? 0],
          ],
          'Kết quả học tập, rèn luyện',
        ),
        text([
          `Danh hiệu: ${t.terms.year?.title ?? 'Không'}.`,
          `Kết quả cuối năm: ${t.terms.year?.promotion ? PROMOTION_LABEL[t.terms.year.promotion] : 'chưa có'}.`,
          `Nhận xét của giáo viên chủ nhiệm: ${t.terms.year?.homeroomComment ?? ''}`,
        ]),
      ],
    };
  }

  // ---- Quản lý sổ điểm ----

  private async entryMonitoring(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const m = await this.control.monitor(user.schoolId, { semester: q.semester!, gradeLevel: q.gradeLevel, teacherId: q.teacherId });
    const rows: Cell[][] = [];
    let last = '';
    for (const r of m.rows) {
      rows.push([rows.length + 1, r.teacherName === last ? '' : r.teacherName, r.className, r.subjectName, r.students, r.expected, r.entered, r.expected - r.entered, `${String(r.percent).replace('.', ',')}%`]);
      last = r.teacherName;
    }
    return {
      fileName: slug(`giam-sat-nhap-diem-hk${q.semester}`),
      title: 'Thống kê tình hình nhập điểm',
      subtitles: [`${semesterName(q.semester!)}, năm học ${year.name}`, this.scopeLine(q.gradeLevel)],
      orientation: 'landscape',
      blocks: [
        table([STT, { header: 'Giáo viên', width: 2.2 }, { header: 'Lớp', width: 0.7 }, { header: 'Môn học', width: 1.8 }, { header: 'Sĩ số', width: 0.6 }, { header: 'Cần nhập', width: 0.8 }, { header: 'Đã nhập', width: 0.8 }, { header: 'Còn thiếu', width: 0.8 }, { header: 'Tỉ lệ', width: 0.8 }], rows),
        text([`Toàn trường: đã nhập ${m.totals.entered}/${m.totals.expected} điểm (${String(m.totals.percent).replace('.', ',')}%).`], { italic: true }),
      ],
    };
  }

  private async missingScores(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const m = await this.control.missing(user.schoolId, { classId: q.classId!, semester: q.semester! });
    return {
      fileName: slug(`hoc-sinh-thieu-diem-${m.class.name}-hk${q.semester}`),
      title: `Danh sách học sinh thiếu điểm lớp ${m.class.name}`,
      subtitles: [semesterName(q.semester!)],
      blocks: [
        table(
          [STT, { header: 'Mã HS', width: 1.3 }, { header: 'Họ và tên', width: 2.4 }, { header: 'Môn học', width: 1.6 }, { header: 'Giáo viên', width: 2 }, { header: 'Cột còn thiếu', width: 2 }],
          m.rows.map((r, i) => [i + 1, r.code, r.fullName, r.subject, r.teacher, r.missing.join(', ')]),
        ),
      ],
    };
  }

  private async scoreEdits(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.yearName(user.schoolId);
    const rows = await this.control.edits(user.schoolId, { semester: q.semester!, classId: q.classId, subjectId: q.subjectId, changesOnly: true });
    const when = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(d);
    return {
      fileName: slug(`thong-ke-sua-diem-hk${q.semester}`),
      title: 'Thống kê sửa điểm',
      subtitles: [`${semesterName(q.semester!)}, năm học ${year.name}`],
      orientation: 'landscape',
      blocks: [
        table(
          [STT, { header: 'Thời gian', width: 1.4 }, { header: 'Lớp', width: 0.6 }, { header: 'Môn học', width: 1.4 }, { header: 'Học sinh', width: 2.2 }, { header: 'Cột', width: 0.6 }, { header: 'Điểm cũ', width: 0.7 }, { header: 'Điểm mới', width: 0.7 }, { header: 'Người sửa', width: 1.8 }, { header: 'Cách sửa', width: 0.9 }],
          rows.map((r, i) => [i + 1, when(r.createdAt), r.class, r.subject, r.studentName, r.column, r.oldValue, r.newValue, r.editedBy, r.source === 'IMPORT' ? 'Nhập Excel' : 'Trực tiếp']),
        ),
      ],
    };
  }
}

export const PARAM_LABEL: Record<ReportParam, string> = {
  classId: 'lớp',
  subjectId: 'môn học',
  studentId: 'học sinh',
  semester: 'học kỳ',
  term: 'học kỳ hoặc cả năm',
  gradeLevel: 'khối',
  from: 'từ ngày',
  to: 'đến ngày',
  status: 'tình trạng',
  promotion: 'kết quả lên lớp',
};

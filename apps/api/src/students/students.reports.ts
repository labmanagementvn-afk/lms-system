import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DisciplineMeasure, Gender, GuardianRelationship, MovementKind, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { toDbDate } from '../canteen/canteen-rules';
import { AuthUser } from '../common/auth-user';
import { YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { Cell, ReportDocument, slug, table, text } from '../reports/document';
import { dmy, gender, level, ReportsService, STT } from '../reports/reports.service';
import { ReportQuery } from '../reports/reports.dto';
import { AWARD_LABEL, MEASURE_LABEL, SEVERITY_LABEL } from './discipline-rules';
import { MOVEMENT_LABEL, POLICY_LABEL, residence } from './record-labels';

const GROUP_STUDENTS = 'Hồ sơ học sinh';
const GROUP_MERITS = 'Khen thưởng, kỷ luật';
const OFFICE: Role[] = [Role.ADMIN, Role.STAFF];

const ENTRY: MovementKind[] = [MovementKind.ENROLLED, MovementKind.TRANSFER_IN];
const EXIT: MovementKind[] = [MovementKind.TRANSFER_OUT, MovementKind.DROPPED];
/** Movements that change the school's roll, and those that lower it. */
const ROLL_UP: MovementKind[] = [MovementKind.ENROLLED, MovementKind.TRANSFER_IN, MovementKind.RETURNED];
const ROLL_DOWN: MovementKind[] = [MovementKind.TRANSFER_OUT, MovementKind.DROPPED];

type Parent = { fullName: string; relationship: GuardianRelationship; occupation: string | null };
/** "Nguyễn Văn An, kỹ sư" */
const parentOf = (guardians: Parent[], relationship: GuardianRelationship) => {
  const g = guardians.find((x) => x.relationship === relationship);
  return g ? [g.fullName, g.occupation].filter(Boolean).join(', ') : '';
};

const period = (q: ReportQuery) => `Từ ngày ${q.from!.split('-').reverse().join('/')} đến ngày ${q.to!.split('-').reverse().join('/')}`;
const byClass = (a: { gradeLevel: number; name: string }, b: { gradeLevel: number; name: string }) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi', { numeric: true });

/**
 * The record books of the student office: the sổ đăng bộ, movements of the roll,
 * the giấy giới thiệu chuyển trường, commendations and discipline under Thông tư
 * 19/2025/TT-BGDĐT, and the students of policy groups.
 */
@Injectable()
export class StudentsReports implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  onModuleInit() {
    this.reports.register(
      { key: 'student-register', group: GROUP_STUDENTS, name: 'Sổ đăng bộ học sinh', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.studentRegister(u, q) },
      { key: 'student-movements', group: GROUP_STUDENTS, name: 'Danh sách biến động học sinh', params: ['from', 'to', 'gradeLevel'], required: ['from', 'to'], build: (u, q) => this.movements(u, q) },
      { key: 'transfer-letter', group: GROUP_STUDENTS, name: 'Giấy giới thiệu chuyển trường', params: ['studentId'], required: ['studentId'], roles: OFFICE, build: (u, q) => this.transferLetter(u, q) },
      { key: 'policy-students', group: GROUP_STUDENTS, name: 'Danh sách học sinh diện chính sách', params: ['gradeLevel', 'classId'], required: [], build: (u, q) => this.policyStudents(u, q) },
      { key: 'student-awards', group: GROUP_MERITS, name: 'Danh sách học sinh được khen thưởng', params: ['from', 'to', 'classId'], required: ['from', 'to'], build: (u, q) => this.awards(u, q) },
      { key: 'student-discipline', group: GROUP_MERITS, name: 'Danh sách học sinh vi phạm và biện pháp kỷ luật', params: ['from', 'to', 'classId'], required: ['from', 'to'], roles: OFFICE, build: (u, q) => this.discipline(u, q) },
    );
  }

  /** Sổ đăng bộ: everyone who entered the school, when and how, and when and why they left. */
  private async studentRegister(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.years.current(user.schoolId);
    const klass = q.classId ? await this.classOf(user.schoolId, q.classId) : null;
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        ...(klass ? { enrollments: { some: { classId: klass.id } } } : q.gradeLevel ? { enrollments: { some: { academicYearId: year.id, class: { gradeLevel: q.gradeLevel } } } } : {}),
      },
      select: {
        fullName: true,
        gender: true,
        dateOfBirth: true,
        birthPlace: true,
        ethnicity: true,
        hometown: true,
        address: true,
        currentWard: true,
        currentProvince: true,
        status: true,
        guardians: { select: { fullName: true, relationship: true, occupation: true } },
        enrollments: { select: { class: { select: { name: true } }, academicYear: { select: { startDate: true } } } },
        movements: { where: { kind: { in: [...ENTRY, ...EXIT] } }, select: { kind: true, date: true, otherSchool: true, reason: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
        completionRecords: { where: { recognizedAt: { not: null } }, select: { recognizedAt: true }, orderBy: { recognizedAt: 'desc' }, take: 1 },
      },
    });
    const lines = students.map((s) => {
      const years = [...s.enrollments].sort((a, b) => a.academicYear.startDate.getTime() - b.academicYear.startDate.getTime());
      // Students placed before movements were recorded entered with their first school year.
      const entry = s.movements.find((m) => ENTRY.includes(m.kind));
      const exit = s.movements.filter((m) => EXIT.includes(m.kind)).at(-1);
      let left: { date: Date | null; reason: string } | null = null;
      if (s.status === StudentStatus.TRANSFERRED || s.status === StudentStatus.DROPPED) {
        const fallback = s.status === StudentStatus.TRANSFERRED ? 'Chuyển trường' : 'Thôi học';
        left = exit ? { date: exit.date, reason: exit.kind === MovementKind.TRANSFER_OUT ? `Chuyển đến ${exit.otherSchool ?? ''}` : `Thôi học${exit.reason ? `: ${exit.reason}` : ''}` } : { date: null, reason: fallback };
      } else if (s.status === StudentStatus.GRADUATED) {
        const done = s.completionRecords[0]?.recognizedAt ?? null;
        left = { date: done, reason: done ? 'Hoàn thành chương trình THCS' : 'Tốt nghiệp' };
      }
      return {
        s,
        entered: entry?.date ?? years[0]?.academicYear.startDate ?? null,
        how: entry ? (entry.kind === MovementKind.TRANSFER_IN ? `Chuyển đến từ ${entry.otherSchool ?? ''}` : 'Tuyển mới') : '',
        className: years.at(-1)?.class.name ?? '',
        left,
      };
    });
    lines.sort((a, b) => (a.entered?.getTime() ?? Infinity) - (b.entered?.getTime() ?? Infinity) || a.s.fullName.localeCompare(b.s.fullName, 'vi'));
    const female = students.filter((s) => s.gender === Gender.FEMALE).length;
    const gone = lines.filter((l) => l.left).length;
    const scope = klass ? `Lớp ${klass.name}` : q.gradeLevel ? `Khối ${q.gradeLevel}, năm học ${year.name}` : 'Toàn trường';
    return {
      fileName: slug(`so-dang-bo-${klass ? klass.name : q.gradeLevel ? `khoi-${q.gradeLevel}` : 'toan-truong'}`),
      title: 'Sổ đăng bộ học sinh',
      subtitles: [scope],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Họ và tên', width: 1.9 },
            { header: 'Ngày sinh', width: 1, align: 'center' },
            { header: 'Giới tính', width: 0.6, align: 'center' },
            { header: 'Nơi sinh', width: 1.2 },
            { header: 'Dân tộc', width: 0.7 },
            { header: 'Quê quán', width: 1.2 },
            { header: 'Chỗ ở hiện nay', width: 2 },
            { header: 'Cha', width: 1.5, group: 'Họ tên, nghề nghiệp' },
            { header: 'Mẹ', width: 1.5, group: 'Họ tên, nghề nghiệp' },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Ngày', width: 1, align: 'center', group: 'Vào trường' },
            { header: 'Hình thức', width: 1.4, group: 'Vào trường' },
            { header: 'Ngày', width: 1, align: 'center', group: 'Rời trường' },
            { header: 'Lý do', width: 1.4, group: 'Rời trường' },
          ],
          lines.map(({ s, entered, how, className, left }, i) => [
            i + 1,
            s.fullName,
            dmy(s.dateOfBirth),
            gender(s.gender),
            s.birthPlace ?? '',
            s.ethnicity ?? '',
            s.hometown ?? '',
            residence(s),
            parentOf(s.guardians, GuardianRelationship.FATHER),
            parentOf(s.guardians, GuardianRelationship.MOTHER),
            className,
            dmy(entered),
            how,
            dmy(left?.date),
            left?.reason ?? '',
          ]),
        ),
        text([`Tổng số: ${students.length} học sinh, trong đó nữ: ${female}. Đang học: ${students.length - gone}; đã rời trường: ${gone}.`], { italic: true }),
      ],
    };
  }

  /** Biến động học sinh over a period: each movement, then how the roll went up and down. */
  private async movements(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    if (q.from! > q.to!) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const rows = await this.prisma.studentMovement.findMany({
      where: {
        schoolId: user.schoolId,
        date: { gte: toDbDate(q.from!), lte: toDbDate(q.to!) },
        ...(q.gradeLevel ? { OR: [{ fromClass: { gradeLevel: q.gradeLevel } }, { toClass: { gradeLevel: q.gradeLevel } }] } : {}),
      },
      include: { student: { select: { code: true, fullName: true, dateOfBirth: true } }, fromClass: { select: { name: true } }, toClass: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const count = (kinds: MovementKind[]) => rows.filter((r) => kinds.includes(r.kind)).length;
    return {
      fileName: slug(`bien-dong-hoc-sinh-${q.from}-${q.to}`),
      title: 'Danh sách biến động học sinh',
      subtitles: [period(q), q.gradeLevel ? `Khối ${q.gradeLevel}` : 'Toàn trường'],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Ngày', width: 0.9, align: 'center' },
            { header: 'Mã học sinh', width: 1.2 },
            { header: 'Họ và tên', width: 2 },
            { header: 'Ngày sinh', width: 0.9, align: 'center' },
            { header: 'Biến động', width: 1 },
            { header: 'Từ lớp', width: 0.6, align: 'center' },
            { header: 'Đến lớp', width: 0.6, align: 'center' },
            { header: 'Trường đi / đến', width: 2 },
            { header: 'Lý do', width: 2 },
            { header: 'Số văn bản', width: 1 },
          ],
          rows.map((r, i) => [i + 1, dmy(r.date), r.student.code, r.student.fullName, dmy(r.student.dateOfBirth), MOVEMENT_LABEL[r.kind], r.fromClass?.name ?? '', r.toClass?.name ?? '', r.otherSchool ?? '', r.reason ?? '', r.documentNo ?? '']),
        ),
        table(
          [{ header: 'Biến động', width: 2 }, { header: 'Số lượt', width: 1, align: 'center' }],
          Object.values(MovementKind).map((k) => [MOVEMENT_LABEL[k], count([k])]),
          'Tổng hợp',
        ),
        text([`Sĩ số tăng ${count(ROLL_UP)} (tuyển mới, chuyển đến, trở lại học), giảm ${count(ROLL_DOWN)} (chuyển đi, thôi học); chuyển lớp trong trường: ${count([MovementKind.CLASS_CHANGE])}.`], { italic: true }),
      ],
    };
  }

  /** Giấy giới thiệu chuyển trường, signed by the principal of the school the student leaves. */
  private async transferLetter(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const s = await this.prisma.student.findFirst({
      where: { id: q.studentId, schoolId: user.schoolId },
      select: {
        id: true,
        code: true,
        fullName: true,
        gender: true,
        dateOfBirth: true,
        birthPlace: true,
        ethnicity: true,
        idNumber: true,
        address: true,
        currentWard: true,
        currentProvince: true,
        status: true,
        guardians: { select: { fullName: true, relationship: true, occupation: true } },
        movements: { where: { kind: MovementKind.TRANSFER_OUT }, include: { fromClass: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1 },
      },
    });
    if (!s) throw new NotFoundException('Không tìm thấy học sinh');
    const m = s.movements[0];
    if (s.status !== StudentStatus.TRANSFERRED || !m) throw new BadRequestException(`${s.fullName} chưa được ghi nhận chuyển trường`);
    const [school, yearOf, results] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { name: true } }),
      m.academicYearId ? this.prisma.academicYear.findUnique({ where: { id: m.academicYearId }, select: { name: true } }) : null,
      this.prisma.termResult.findMany({
        where: { studentId: s.id, OR: [{ academic: { not: null } }, { conduct: { not: null } }] },
        select: { semester: true, academic: true, conduct: true, academicAfterRetake: true, conductAfterTraining: true, academicYear: { select: { name: true, startDate: true } } },
      }),
    ]);
    // The latest result: the year's when it is in, else the latest semester's.
    const rank = (semester: number) => (semester === YEAR ? 3 : semester);
    const latest = results.sort((a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime() || rank(b.semester) - rank(a.semester))[0];
    const resultLine = latest
      ? `Kết quả ${latest.semester === YEAR ? 'cả năm' : latest.semester === 1 ? 'học kỳ I' : 'học kỳ II'} năm học ${latest.academicYear.name}: rèn luyện ${level(latest.conductAfterTraining ?? latest.conduct) || 'chưa đánh giá'}, học tập ${level(latest.academicAfterRetake ?? latest.academic) || 'chưa đánh giá'}.`
      : 'Học sinh chưa có kết quả đánh giá học kỳ tại trường.';
    const fields: [string, Cell][] = [
      ['Họ và tên học sinh', s.fullName],
      ['Giới tính', gender(s.gender)],
      ['Ngày sinh', dmy(s.dateOfBirth)],
      ['Nơi sinh', s.birthPlace ?? ''],
      ['Dân tộc', s.ethnicity ?? ''],
      ['Mã định danh', s.idNumber ?? ''],
      ['Họ tên cha', parentOf(s.guardians, GuardianRelationship.FATHER)],
      ['Họ tên mẹ', parentOf(s.guardians, GuardianRelationship.MOTHER)],
    ];
    return {
      fileName: slug(`giay-gioi-thieu-chuyen-truong-${s.code}`),
      number: `Số: ${m.documentNo ?? '        /GGT'}`,
      title: 'Giấy giới thiệu chuyển trường',
      date: m.date,
      blocks: [
        text([`Kính gửi: Hiệu trưởng ${m.otherSchool ?? ''}`], { bold: true, align: 'center' }),
        text([`Hiệu trưởng ${school.name} trân trọng giới thiệu:`]),
        { type: 'fields', fields },
        text(
          [
            `Chỗ ở hiện nay: ${residence(s)}`,
            `Là học sinh lớp ${m.fromClass?.name ?? ''}${yearOf ? `, năm học ${yearOf.name}` : ''}, được chuyển đến học tại ${m.otherSchool ?? ''} từ ngày ${dmy(m.date)}.`,
            `Lý do chuyển trường: ${m.reason ?? 'theo nguyện vọng của gia đình'}.`,
            resultLine,
            'Nhà trường bàn giao học bạ (bản chính) và hồ sơ của học sinh theo quy định về chuyển trường. Đề nghị quý trường tiếp nhận học sinh.',
          ],
          { align: 'justify' },
        ),
      ],
      footnote: ['Nơi nhận:', '- Như trên;', '- Gia đình học sinh;', '- Lưu: VT.'],
    };
  }

  /** Students of the year in policy groups (diện chính sách), for exemptions and support. */
  private async policyStudents(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.years.current(user.schoolId);
    const rows = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: year.id,
        class: { schoolId: user.schoolId, ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}), ...(q.classId ? { id: q.classId } : {}) },
        student: { status: StudentStatus.STUDYING, policyGroups: { isEmpty: false } },
      },
      select: {
        class: { select: { name: true, gradeLevel: true } },
        student: { select: { fullName: true, gender: true, dateOfBirth: true, ethnicity: true, policyGroups: true, address: true, currentWard: true, currentProvince: true } },
      },
    });
    rows.sort((a, b) => byClass(a.class, b.class) || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    const groups = Object.entries(POLICY_LABEL).map(([g, label]) => [label, rows.filter((r) => r.student.policyGroups.includes(g as keyof typeof POLICY_LABEL)).length] as Cell[]);
    const className = q.classId ? rows[0]?.class.name : undefined;
    return {
      fileName: slug(`hoc-sinh-dien-chinh-sach-${className ?? (q.gradeLevel ? `khoi-${q.gradeLevel}` : 'toan-truong')}`),
      title: 'Danh sách học sinh diện chính sách',
      subtitles: [`Năm học ${year.name}`, className ? `Lớp ${className}` : q.gradeLevel ? `Khối ${q.gradeLevel}` : 'Toàn trường'],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Họ và tên', width: 2 },
            { header: 'Ngày sinh', width: 0.9, align: 'center' },
            { header: 'Giới tính', width: 0.6, align: 'center' },
            { header: 'Dân tộc', width: 0.7 },
            { header: 'Diện chính sách', width: 2.4 },
            { header: 'Chỗ ở hiện nay', width: 2.6 },
          ],
          rows.map((r, i) => [i + 1, r.class.name, r.student.fullName, dmy(r.student.dateOfBirth), gender(r.student.gender), r.student.ethnicity ?? '', r.student.policyGroups.map((g) => POLICY_LABEL[g]).join('; '), residence(r.student)]),
        ),
        table([{ header: 'Diện chính sách', width: 2 }, { header: 'Số học sinh', width: 1, align: 'center' }], groups, 'Tổng hợp (một học sinh có thể thuộc nhiều diện)'),
      ],
    };
  }

  private async awards(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    if (q.from! > q.to!) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const klass = q.classId ? await this.classOf(user.schoolId, q.classId) : null;
    const rows = await this.prisma.studentAward.findMany({
      where: { schoolId: user.schoolId, date: { gte: toDbDate(q.from!), lte: toDbDate(q.to!) }, ...(klass ? { classId: klass.id } : {}) },
      include: { student: { select: { fullName: true } }, class: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const author = await this.authors(rows);
    return {
      fileName: slug(`khen-thuong-hoc-sinh-${klass?.name ?? 'toan-truong'}-${q.from}-${q.to}`),
      title: 'Danh sách học sinh được khen thưởng',
      subtitles: [period(q), klass ? `Lớp ${klass.name}` : 'Toàn trường'],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Ngày', width: 0.9, align: 'center' },
            { header: 'Họ và tên', width: 2 },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Hình thức', width: 1.7 },
            { header: 'Nội dung khen thưởng', width: 3.2 },
            { header: 'Số quyết định', width: 1 },
            { header: 'Người khen', width: 1.5 },
          ],
          rows.map((r, i) => [i + 1, dmy(r.date), r.student.fullName, r.class?.name ?? '', AWARD_LABEL[r.form], r.content, r.decisionNo ?? '', r.issuer ?? author.get(r.createdById) ?? '']),
        ),
        text([`Tổng số: ${rows.length} lượt khen thưởng, ${new Set(rows.map((r) => r.studentId)).size} học sinh. ${Object.entries(AWARD_LABEL).map(([f, label]) => `${label}: ${rows.filter((r) => r.form === f).length}`).join('; ')}.`], { italic: true }),
      ],
    };
  }

  private async discipline(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    if (q.from! > q.to!) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const klass = q.classId ? await this.classOf(user.schoolId, q.classId) : null;
    const rows = await this.prisma.studentDiscipline.findMany({
      where: { schoolId: user.schoolId, date: { gte: toDbDate(q.from!), lte: toDbDate(q.to!) }, ...(klass ? { classId: klass.id } : {}) },
      include: { student: { select: { fullName: true } }, class: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const author = await this.authors(rows);
    const confirmed = (r: (typeof rows)[number]) => (r.measure !== DisciplineMeasure.SELF_REVIEW ? '' : r.familyConfirmedAt ? dmy(r.familyConfirmedAt) : 'Chưa');
    return {
      fileName: slug(`ky-luat-hoc-sinh-${klass?.name ?? 'toan-truong'}-${q.from}-${q.to}`),
      title: 'Danh sách học sinh vi phạm và biện pháp kỷ luật',
      subtitles: [period(q), klass ? `Lớp ${klass.name}` : 'Toàn trường'],
      orientation: 'landscape',
      blocks: [
        table(
          [
            STT,
            { header: 'Ngày', width: 0.9, align: 'center' },
            { header: 'Họ và tên', width: 1.9 },
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Hành vi vi phạm', width: 2.6 },
            { header: 'Mức độ', width: 0.6, align: 'center' },
            { header: 'Biện pháp', width: 1.5 },
            { header: 'Hoạt động hỗ trợ', width: 2.2 },
            { header: 'Gia đình xác nhận', width: 1, align: 'center' },
            { header: 'Người ghi nhận', width: 1.4 },
          ],
          rows.map((r, i) => [i + 1, dmy(r.date), r.student.fullName, r.class?.name ?? '', r.violation, r.severity, MEASURE_LABEL[r.measure], r.support ?? '', confirmed(r), author.get(r.createdById) ?? '']),
        ),
        text(
          [
            `Tổng số: ${rows.length} lượt, ${new Set(rows.map((r) => r.studentId)).size} học sinh. ${Object.entries(MEASURE_LABEL).map(([m, label]) => `${label}: ${rows.filter((r) => r.measure === m).length}`).join('; ')}.`,
            ...[1, 2, 3].map((n) => `${SEVERITY_LABEL[n]}.`),
            'Bản tự kiểm điểm có xác nhận và cam kết của gia đình được lưu vào hồ sơ học sinh (Điều 15 Thông tư 19/2025/TT-BGDĐT).',
          ],
          { italic: true },
        ),
      ],
    };
  }

  private async classOf(schoolId: string, classId: string) {
    const c = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } });
    if (!c) throw new NotFoundException('Không tìm thấy lớp');
    return c;
  }

  /** Names of whoever recorded the rows. */
  private async authors(rows: { createdById: string }[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}

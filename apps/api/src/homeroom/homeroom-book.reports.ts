import { Injectable, OnModuleInit } from '@nestjs/common';
import { GuardianRelationship, ResultLevel } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { LEVEL_LABEL } from '../grades/grades.service';
import { Cell, ReportBlock, ReportColumn, ReportDocument, slug, table, text } from '../reports/document';
import { ReportQuery } from '../reports/reports.dto';
import { level, ReportsService, STT } from '../reports/reports.service';
import { POLICY_LABEL } from '../students/record-labels';
import { dmy } from './dates';
import { HomeroomBookService } from './homeroom-book.service';
import { NOTE_KIND_LABEL } from './homeroom-book.rules';

const GROUP = 'Công tác chủ nhiệm';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
const RELATION: Record<GuardianRelationship, string> = { FATHER: 'Cha', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ', OTHER: 'Người thân' };
const LEVELS: ResultLevel[] = [ResultLevel.TOT, ResultLevel.KHA, ResultLevel.DAT, ResultLevel.CHUA_DAT];
const center = (header: string, width: number, group?: string): ReportColumn => ({ header, width, align: 'center', group });
/** The teacher's paragraphs, one line each. */
const paragraphs = (v: string | undefined) => (v ? v.split(/\n+/).map((l) => l.trim()).filter(Boolean) : []);

/** Sổ chủ nhiệm, printed: what the teacher wrote in the book and what the school knows of the class. */
@Injectable()
export class HomeroomBookReports implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly book: HomeroomBookService,
  ) {}

  onModuleInit() {
    this.reports.register({ key: 'homeroom-book', group: GROUP, name: 'Sổ chủ nhiệm', params: ['classId'], required: ['classId'], build: (u, q) => this.print(u, q) });
  }

  private async print(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const b = await this.book.book(user, { classId: q.classId! });
    const c = b.class;
    const s = b.situation;
    let n = 0;
    const numbered = (title: string) => `${ROMAN[n++]}. ${title}`;
    /** A table under its title, or the title and a line saying the part is empty. */
    const section = (title: string, columns: ReportColumn[], rows: Cell[][], empty = 'Chưa ghi.'): ReportBlock[] =>
      rows.length ? [table(columns, rows, title)] : [text([title], { bold: true }), text([empty], { italic: true })];
    const writing = (title: string, v: string | undefined): ReportBlock[] => [text([title], { bold: true, italic: true }), text(paragraphs(v).length ? paragraphs(v) : ['Chưa ghi.'], paragraphs(v).length ? { align: 'justify' } : { italic: true })];

    const unions = [c.gradeLevel < 10 ? `đội viên ${s.youngPioneer}` : '', s.youthUnion || c.gradeLevel >= 10 ? `đoàn viên ${s.youthUnion}` : ''].filter(Boolean).join(', ');
    const prev = s.previous;
    const situation = [
      `Sĩ số: ${s.total} học sinh, trong đó nữ ${s.female}, dân tộc thiểu số ${s.ethnicMinority}, theo tôn giáo ${s.religion}; ${unions}.`,
      `Học sinh thuộc diện chính sách: ${s.policy.length ? s.policy.map((p) => `${POLICY_LABEL[p.group].toLowerCase()} ${p.count}`).join(', ') : 'không có'}.`,
      ...(prev
        ? [
            `Kết quả năm học ${prev.academicYear.name} của ${prev.students} học sinh: học tập ${LEVELS.map((l) => `${LEVEL_LABEL[l]} ${prev.academic[l]}`).join(', ')}; rèn luyện ${LEVELS.map((l) => `${LEVEL_LABEL[l]} ${prev.conduct[l]}`).join(', ')}; ${prev.excellent} học sinh Xuất sắc, ${prev.good} học sinh Giỏi.`,
          ]
        : []),
      ...paragraphs(b.yearPlan.situation),
    ];

    const seating = b.seating;
    const notes = [...b.notes].reverse();

    const blocks: ReportBlock[] = [
      {
        type: 'fields',
        fields: [
          ['Lớp', c.name],
          ['Năm học', c.academicYear.name],
          ['Giáo viên chủ nhiệm', c.homeroomTeacher?.fullName ?? ''],
          ['Điện thoại', c.homeroomTeacher?.phone ?? ''],
          ['Phòng học', c.room ?? ''],
          ['Sĩ số', `${s.total} học sinh (${s.female} nữ)`],
        ],
      },
      ...section(
        numbered('Danh sách giáo viên bộ môn'),
        [STT, { header: 'Môn học', width: 1.6 }, { header: 'Học kỳ I', width: 2 }, { header: 'Học kỳ II', width: 2 }],
        b.subjectTeachers.map((t, i) => [i + 1, t.subject.name, t.semester1.join(', '), t.semester2.join(', ')]),
        'Chưa có phân công giảng dạy.',
      ),
      ...section(numbered('Ban cán sự lớp'), [STT, { header: 'Chức vụ', width: 2 }, { header: 'Họ và tên học sinh', width: 2.5 }], b.officers.map((o, i) => [i + 1, o.role, o.student.fullName])),
      ...section(
        numbered('Ban đại diện cha mẹ học sinh'),
        [STT, { header: 'Chức vụ', width: 1.3 }, { header: 'Họ và tên', width: 1.8 }, { header: 'Cha mẹ của học sinh', width: 2 }, center('Điện thoại', 1.1)],
        b.parentCommittee.map((m, i) => [i + 1, m.role, m.guardian.fullName, `${RELATION[m.guardian.relationship]} em ${m.student.fullName}`, m.guardian.phone]),
      ),
      ...section(
        numbered('Danh sách học sinh'),
        [
          STT,
          { header: 'Họ và tên', width: 1.45 },
          center('Ngày sinh', 1.15),
          center('Nữ', 0.35),
          center('Dân tộc', 0.6),
          { header: 'Diện chính sách', width: 0.8 },
          { header: 'Cha mẹ, người giám hộ', width: 1.7 },
          center('Điện thoại', 1.3),
          { header: 'Chỗ ở hiện nay', width: 1.45 },
        ],
        b.students.map((st, i) => [
          i + 1,
          st.fullName,
          st.dateOfBirth ? dmy(st.dateOfBirth) : '',
          st.gender === 'FEMALE' ? 'x' : '',
          st.ethnicity ?? '',
          st.policyGroups.map((g) => POLICY_LABEL[g]).join(', '),
          st.guardians.map((g) => `${RELATION[g.relationship]}: ${g.fullName}${g.occupation ? `, ${g.occupation}` : ''}`).join('\n'),
          (st.guardians.find((g) => g.isPrimary) ?? st.guardians[0])?.phone ?? '',
          st.residence,
        ]),
        'Lớp chưa có học sinh.',
      ),
      text([numbered('Đặc điểm tình hình lớp')], { bold: true }),
      text(situation, { align: 'justify' }),
      text([numbered('Kế hoạch chủ nhiệm năm học')], { bold: true }),
      ...writing('1. Mục tiêu giáo dục', b.yearPlan.goals),
      ...writing('2. Chỉ tiêu phấn đấu', b.yearPlan.targets),
      ...writing('3. Biện pháp thực hiện', b.yearPlan.measures),
      ...section(
        numbered('Tổ và sơ đồ chỗ ngồi'),
        [{ header: 'Tổ', width: 0.8 }, { header: 'Tổ trưởng', width: 1.5 }, center('Số học sinh', 0.7), { header: 'Thành viên', width: 4 }],
        b.groups.map((g) => [g.name, g.leader?.fullName ?? '', g.students.length, g.students.map((st) => st.fullName).join(', ')]),
        'Chưa chia tổ.',
      ),
      ...(seating
        ? [
            table(
              [center('Bàn', 0.6), ...Array.from({ length: seating.columns }, (_, i) => center(`Dãy ${i + 1}`, 2))],
              seating.seats.map((row, r) => [
                r + 1,
                ...Array.from({ length: seating.columns }, (_, col) =>
                  row
                    .slice(col * seating.seatsPerDesk, (col + 1) * seating.seatsPerDesk)
                    .map((st) => st?.fullName ?? '(trống)')
                    .join('\n'),
                ),
              ]),
              'Sơ đồ chỗ ngồi (bàn 1 ở đầu lớp, gần bảng)',
            ),
          ]
        : [text(['Chưa xếp sơ đồ chỗ ngồi.'], { italic: true })]),
      ...section(
        numbered('Kế hoạch chủ nhiệm từng tháng'),
        [center('Tháng', 0.7), { header: 'Chủ điểm', width: 1.3 }, { header: 'Nội dung công việc', width: 3 }, { header: 'Đánh giá kết quả', width: 2 }],
        b.monthPlans.map((p) => [p.month.split('-').reverse().join('/'), p.theme ?? '', p.tasks, p.review ?? '']),
      ),
      ...section(
        numbered('Theo dõi học sinh'),
        [STT, center('Ngày', 1.15), { header: 'Họ và tên', width: 1.4 }, { header: 'Diện theo dõi', width: 1 }, { header: 'Nội dung', width: 2 }, { header: 'Biện pháp giáo dục, giúp đỡ', width: 1.8 }, { header: 'Kết quả', width: 1.3 }],
        notes.map((x, i) => [i + 1, dmy(x.date), x.student.fullName, NOTE_KIND_LABEL[x.kind], x.content, x.action ?? '', x.result ?? '']),
      ),
      ...section(
        numbered('Họp cha mẹ học sinh'),
        [center('Ngày', 0.9), { header: 'Nội dung cuộc họp', width: 2.6 }, center('Có mặt', 0.6), { header: 'Ý kiến của cha mẹ học sinh', width: 1.9 }, { header: 'Kết luận', width: 1.9 }],
        b.meetings.map((m) => [dmy(m.date), `${m.title}\n${m.content}`, m.attended !== null ? `${m.attended}${m.invited !== null ? `/${m.invited}` : ''}` : '', m.opinions ?? '', m.conclusions ?? '']),
      ),
      ...section(
        numbered('Kết quả học tập, rèn luyện và chuyên cần'),
        [
          STT,
          { header: 'Họ và tên', width: 1.6 },
          center('Học tập', 0.65, 'Học kỳ I'),
          center('Rèn luyện', 0.7, 'Học kỳ I'),
          center('Học tập', 0.65, 'Học kỳ II'),
          center('Rèn luyện', 0.7, 'Học kỳ II'),
          center('Học tập', 0.65, 'Cả năm'),
          center('Rèn luyện', 0.7, 'Cả năm'),
          center('Danh hiệu', 1, 'Cả năm'),
          center('Có phép', 0.55, 'Nghỉ học'),
          center('Không phép', 0.6, 'Nghỉ học'),
          center('Khen thưởng', 0.65),
          center('Kỷ luật', 0.55),
        ],
        b.students.map((st, i) => [
          i + 1,
          st.fullName,
          level(st.results.semester1?.academic),
          level(st.results.semester1?.conduct),
          level(st.results.semester2?.academic),
          level(st.results.semester2?.conduct),
          level(st.results.year?.academic),
          level(st.results.year?.conduct),
          st.results.year?.title ?? '',
          st.absences.excused || '',
          st.absences.unexcused || '',
          st.awards || '',
          st.disciplines || '',
        ]),
        'Lớp chưa có học sinh.',
      ),
      ...section(
        numbered('Ý kiến kiểm tra của Ban giám hiệu'),
        [center('Ngày', 0.9), { header: 'Ý kiến', width: 4.2 }, { header: 'Người kiểm tra', width: 1.5 }],
        b.reviews.map((r) => [dmy(r.date), r.content, r.author]),
        'Chưa có ý kiến.',
      ),
    ];
    return {
      fileName: slug(`so-chu-nhiem-${c.name}-${c.academicYear.name}`),
      title: 'Sổ chủ nhiệm',
      subtitles: [`Lớp ${c.name} · Năm học ${c.academicYear.name}`],
      blocks,
      cosigner: { title: 'Giáo viên chủ nhiệm', name: c.homeroomTeacher?.fullName },
    };
  }
}

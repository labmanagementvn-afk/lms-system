import { Injectable, OnModuleInit } from '@nestjs/common';
import { Session } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { dmy } from '../homeroom/dates';
import { orderSubjects } from '../grades/results';
import { PrismaService } from '../prisma/prisma.service';
import { Cell, ReportDocument, slug, table, TableBlock, text } from '../reports/document';
import { ReportQuery } from '../reports/reports.dto';
import { ReportsService, STT } from '../reports/reports.service';
import { AssignmentsService, byClassName } from './assignments.service';
import { CalendarService } from './calendar.service';
import { DutiesService } from './duties.service';
import { CIRCULAR, periodsText } from './workload';

const GROUP = 'Cán bộ, giáo viên';

const SEMESTER = ['', 'Học kỳ I', 'Học kỳ II'];
const DAY_NAME = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const SESSION_NAME: Record<Session, string> = { MORNING: 'Sáng', AFTERNOON: 'Chiều' };
/** "+4", "-1,5", "0": over or short of the norm. */
const signed = (n: number) => (n > 0 ? `+${periodsText(n)}` : n < 0 ? `-${periodsText(-n)}` : '0');

/** Bảng phân công chuyên môn, phân công giảng dạy theo lớp and lịch báo giảng. */
@Injectable()
export class TeachingReports implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly duties: DutiesService,
    private readonly calendar: CalendarService,
  ) {}

  onModuleInit() {
    this.reports.register(
      { key: 'teaching-assignments', group: GROUP, name: 'Bảng phân công chuyên môn và định mức tiết dạy', params: ['semester'], required: ['semester'], build: (u, q) => this.staffing(u, q) },
      { key: 'teaching-by-class', group: GROUP, name: 'Bảng phân công giảng dạy theo lớp', params: ['semester', 'gradeLevel'], required: ['semester'], build: (u, q) => this.byClass(u, q) },
      { key: 'lesson-calendar', group: GROUP, name: 'Lịch báo giảng', params: ['teacherId', 'week'], required: ['week'], build: (u, q) => this.lessonCalendar(u, q) },
    );
  }

  /** Each teacher's positions and duties, the subjects and classes they teach, and their load against the norm, by tổ chuyên môn. */
  private async staffing(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const w = await this.duties.workload(user.schoolId, { semester: q.semester!, academicYearId: q.academicYearId });
    const groups = new Map<string, typeof w.rows>();
    for (const r of w.rows) {
      const name = r.position && !r.teacher.subjectGroup ? 'Ban giám hiệu' : (r.teacher.subjectGroup ?? 'Chưa xếp tổ chuyên môn');
      groups.set(name, [...(groups.get(name) ?? []), r]);
    }
    const columns = [
      STT,
      { header: 'Họ và tên', width: 1.7 },
      { header: 'Chức vụ, kiêm nhiệm', width: 2 },
      { header: 'Phân công giảng dạy (số tiết/tuần)', width: 2.6 },
      { header: 'Chủ nhiệm', width: 0.8, align: 'center' as const },
      { header: 'Định mức', width: 0.7, align: 'center' as const, group: 'Số tiết/tuần' },
      { header: 'Được giảm', width: 0.7, align: 'center' as const, group: 'Số tiết/tuần' },
      { header: 'Phải dạy', width: 0.7, align: 'center' as const, group: 'Số tiết/tuần' },
      { header: 'Được phân công', width: 0.8, align: 'center' as const, group: 'Số tiết/tuần' },
      { header: 'Thừa (+), thiếu (-)', width: 0.8, align: 'center' as const, group: 'Số tiết/tuần' },
      { header: 'Ghi chú', width: 1.8 },
    ];
    let n = 0;
    const blocks: TableBlock[] = [...groups.entries()].map(([name, rows]) =>
      table(
        columns,
        rows.map((r) => [
          ++n,
          r.teacher.fullName,
          [r.position, ...r.duties.filter((d) => d.dutyType.kind !== 'POSITION').map((d) => (d.note ? `${d.dutyType.name} (${d.note})` : d.dutyType.name))].filter(Boolean).join('; '),
          r.teaching.map((t) => `${t.subject}: ${t.classes.join(', ')} (${periodsText(t.periods)})`).join('; '),
          r.homeroomClasses.join(', '),
          periodsText(r.norm),
          r.reduced ? periodsText(r.reduced) : '',
          periodsText(r.required),
          periodsText(r.assigned),
          signed(r.difference),
          r.warnings.join('; '),
        ]),
        name,
      ),
    );
    const s = w.setting;
    return {
      fileName: slug(`phan-cong-chuyen-mon-hk${q.semester}-${w.academicYear.name}`),
      title: 'Bảng phân công chuyên môn',
      subtitles: [`${SEMESTER[q.semester!]}, năm học ${w.academicYear.name}`],
      orientation: 'landscape',
      blocks: [
        ...blocks,
        text(
          [
            `Định mức tiết dạy (${CIRCULAR}): giáo viên ${periodsText(s.teacherNorm)} tiết/tuần; giáo viên chủ nhiệm lớp được giảm ${periodsText(s.homeroomReduction)} tiết/tuần; chức vụ và kiêm nhiệm theo danh mục của trường.`,
            `Tổng số: ${w.totals.teachers} cán bộ, giáo viên; ${periodsText(w.totals.assigned)} tiết/tuần được phân công; ${w.totals.over} người dạy vượt, ${w.totals.short} người thiếu tiết so với định mức.`,
          ],
          { italic: true },
        ),
      ],
    };
  }

  /** Each class of the semester with the teacher of every subject, as posted in the staff room. */
  private async byClass(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const year = await this.assignments.yearOf(user.schoolId, q.academicYearId);
    const [classes, rows] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId: user.schoolId, academicYearId: year.id, ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}) }, select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { fullName: true } } } }),
      this.prisma.teachingAssignment.findMany({
        where: { schoolId: user.schoolId, academicYearId: year.id, semester: q.semester, ...(q.gradeLevel ? { class: { gradeLevel: q.gradeLevel } } : {}) },
        select: { classId: true, periodsPerWeek: true, subject: { select: { id: true, code: true, name: true } }, teacher: { select: { fullName: true } } },
        orderBy: [{ createdAt: 'asc' }, { teacher: { fullName: 'asc' } }],
      }),
    ]);
    classes.sort(byClassName);
    const subjects = orderSubjects([...new Map(rows.map((r) => [r.subject.id, r.subject])).values()]);
    const lines: Cell[][] = classes.map((c) => {
      const mine = rows.filter((r) => r.classId === c.id);
      const total = mine.reduce((a, r) => a + Number(r.periodsPerWeek), 0);
      return [
        c.name,
        c.homeroomTeacher?.fullName ?? '',
        ...subjects.map((s) =>
          mine
            .filter((r) => r.subject.id === s.id)
            .map((r) => `${r.teacher.fullName} (${periodsText(Number(r.periodsPerWeek))})`)
            .join('\n'),
        ),
        periodsText(total),
      ];
    });
    return {
      fileName: slug(`phan-cong-giang-day-theo-lop-hk${q.semester}${q.gradeLevel ? `-khoi-${q.gradeLevel}` : ''}`),
      title: 'Bảng phân công giảng dạy theo lớp',
      subtitles: [`${q.gradeLevel ? `Khối ${q.gradeLevel} · ` : ''}${SEMESTER[q.semester!]}, năm học ${year.name}`],
      orientation: 'landscape',
      blocks: [
        table(
          [
            { header: 'Lớp', width: 0.6, align: 'center' },
            { header: 'Giáo viên chủ nhiệm', width: 1.3 },
            ...subjects.map((s) => ({ header: s.name, width: 1.1, group: 'Môn học: giáo viên (số tiết/tuần)' })),
            { header: 'Tổng số tiết/tuần', width: 0.7, align: 'center' as const },
          ],
          lines,
        ),
      ],
    };
  }

  /** One teacher's week: each period with the lesson of the subject's plan, the teaching aids and notes. */
  private async lessonCalendar(user: AuthUser, q: ReportQuery): Promise<ReportDocument> {
    const week = await this.calendar.week(user, { teacherId: q.teacherId, date: q.week });
    const rows: Cell[][] = [];
    for (const d of week.days) {
      d.slots.forEach((s, i) => {
        rows.push([
          i === 0 ? `${DAY_NAME[d.dayOfWeek]}\n${dmy(d.date)}` : '',
          s.session ? SESSION_NAME[s.session] : '',
          s.periodNumber,
          s.class.name,
          s.subject.name,
          s.plan?.lessonNo ?? '',
          s.plan?.title ?? '',
          s.plan?.aids ?? '',
          [s.scheduled ? '' : 'Ngoài thời khóa biểu', s.plan?.note ?? ''].filter(Boolean).join('; '),
        ]);
      });
    }
    const range = `từ ngày ${dmy(week.week.from)} đến ngày ${dmy(week.week.to)}`;
    return {
      fileName: slug(`lich-bao-giang-${week.teacher.fullName}-${week.week.from}`),
      title: 'Lịch báo giảng',
      subtitles: [week.week.number ? `Tuần ${week.week.number}: ${range}` : range.charAt(0).toUpperCase() + range.slice(1), `Giáo viên: ${week.teacher.fullName} · Năm học ${week.academicYear.name}`],
      blocks: [
        table(
          [
            { header: 'Thứ, ngày', width: 1.1, align: 'center' },
            { header: 'Buổi', width: 0.6, align: 'center' },
            { header: 'Tiết', width: 0.45, align: 'center' },
            { header: 'Lớp', width: 0.55, align: 'center' },
            { header: 'Môn', width: 1 },
            { header: 'Tiết PPCT', width: 0.6, align: 'center' },
            { header: 'Tên bài dạy', width: 2.4 },
            { header: 'Đồ dùng dạy học', width: 1.4 },
            { header: 'Ghi chú', width: 1 },
          ],
          rows,
        ),
        text([`Số tiết trong tuần: ${rows.length}; đã báo giảng: ${rows.filter((r) => r[6]).length}.`], { italic: true }),
      ],
      cosigner: { title: 'Giáo viên', name: week.teacher.fullName },
    };
  }
}

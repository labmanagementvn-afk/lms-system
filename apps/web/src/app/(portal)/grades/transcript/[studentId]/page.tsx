'use client';

import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Button, Empty, Select, Space, Spin } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { fmtMark, passedLabel } from '@/components/grades/ResultLevelTag';
import { useAcademicYears } from '@/lib/hooks';
import { GENDER, PROMOTION_STATUS, RESULT_LEVEL } from '@/lib/labels';

interface Cell {
  average: number | null;
  passed: boolean | null;
}
interface Term {
  academic: string | null;
  conduct: string | null;
  title: string | null;
  promotion: string | null;
  absentDays: number;
  homeroomComment: string | null;
  academicAfterRetake?: string | null;
  conductAfterTraining?: string | null;
}
interface Transcript {
  school: { name: string; address: string | null };
  student: { id: string; code: string; fullName: string; gender: string | null; dateOfBirth: string | null };
  class: { id: string; name: string; gradeLevel: number } | null;
  academicYear: { id: string; name: string };
  subjects: { subjectId: string; code: string; name: string; assessment: 'SCORE' | 'COMMENT'; hk1: Cell; hk2: Cell; year: Cell }[];
  terms: { hk1: Term | null; hk2: Term | null; year: Term | null };
  homeroomTeacher: { id: string; fullName: string } | null;
  retakes: { subjectId: string; name: string; assessment: 'SCORE' | 'COMMENT'; score: number | null; passed: boolean | null; note: string | null }[];
  training: { tasks: string; result: string | null; comment: string | null } | null;
  completion: { round: number; decisionNo: string | null; decidedOn: string | null; signerTitle: string | null; signerName: string | null; registerNo: number | null } | null;
}

const cell = (assessment: string, c: Cell) => (assessment === 'COMMENT' ? (passedLabel(c.passed) === '—' ? '' : passedLabel(c.passed)) : c.average === null ? '' : fmtMark(c.average));
const level = (l: string | null | undefined) => (l ? RESULT_LEVEL[l]?.label : '');
const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
/** Lên lớp as printed: a RETEST student whose conduct failed does summer training. */
const promotionText = (term: Term | null) => {
  if (!term?.promotion) return '';
  if (term.promotion === 'RETEST' && term.conduct === 'CHUA_DAT' && term.academic && term.academic !== 'CHUA_DAT') return 'Rèn luyện hè';
  return PROMOTION_STATUS[term.promotion]?.label ?? '';
};

const PRINT_CSS = `
  @media print {
    .ant-layout-sider, .ant-layout-header, .no-print { display: none !important; }
    .ant-layout, .ant-layout-content { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    body { background: #fff; }
  }
  .hocba { max-width: 800px; margin: 0 auto; background: #fff; color: #000; padding: 24px 32px; font-family: 'Times New Roman', serif; font-size: 14px; }
  .hocba table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .hocba th, .hocba td { border: 1px solid #000; padding: 4px 6px; }
  .hocba th { text-align: center; font-weight: 700; }
  .hocba td.num { text-align: center; }
  .hocba h2 { text-align: center; margin: 12px 0 4px; font-size: 20px; letter-spacing: 1px; }
  .hocba .info { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin-top: 8px; }
  .hocba .sign { display: grid; grid-template-columns: 1fr 1fr; text-align: center; margin-top: 32px; }
`;

/** Học bạ: a printable record of one student's year. */
export default function TranscriptPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data: years } = useAcademicYears();
  const [academicYearId, setYear] = useState<string>();
  const { data, isLoading } = useSWR<Transcript>([`/grades/transcript/${studentId}`, { academicYearId }]);

  if (isLoading && !data) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!data) return <Empty description="Không tìm thấy học sinh" />;

  const t = data.terms;
  const termRows: [string, Term | null][] = [
    ['Học kỳ 1', t.hk1],
    ['Học kỳ 2', t.hk2],
    ['Cả năm', t.year],
  ];

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader
          title="Học bạ"
          extra={
            <Space wrap>
              <Select
                value={academicYearId ?? data.academicYear.id}
                onChange={setYear}
                style={{ width: 150 }}
                options={(years ?? []).map((y) => ({ value: y.id, label: y.name }))}
              />
              <Link href="/grades/results">
                <Button icon={<ArrowLeftOutlined />}>Kết quả học tập</Button>
              </Link>
              <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
                In
              </Button>
            </Space>
          }
        />
      </div>
      <div className="hocba">
        <div style={{ textAlign: 'center', fontWeight: 700 }}>{data.school.name.toUpperCase()}</div>
        {data.school.address && <div style={{ textAlign: 'center' }}>{data.school.address}</div>}
        <h2>HỌC BẠ NĂM HỌC {data.academicYear.name}</h2>
        <div className="info">
          <div>
            Họ và tên: <b>{data.student.fullName}</b>
          </div>
          <div>Mã học sinh: {data.student.code}</div>
          <div>Giới tính: {data.student.gender ? GENDER[data.student.gender] : ''}</div>
          <div>Ngày sinh: {dmy(data.student.dateOfBirth)}</div>
          <div>Lớp: {data.class?.name ?? ''}</div>
          <div>Giáo viên chủ nhiệm: {data.homeroomTeacher?.fullName ?? ''}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>TT</th>
              <th>Môn học</th>
              <th style={{ width: 90 }}>Học kỳ 1</th>
              <th style={{ width: 90 }}>Học kỳ 2</th>
              <th style={{ width: 90 }}>Cả năm</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((s, i) => (
              <tr key={s.subjectId}>
                <td className="num">{i + 1}</td>
                <td>{s.name}</td>
                <td className="num">{cell(s.assessment, s.hk1)}</td>
                <td className="num">{cell(s.assessment, s.hk2)}</td>
                <td className="num">{cell(s.assessment, s.year)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th></th>
              <th>Kết quả học tập</th>
              <th>Kết quả rèn luyện</th>
              <th>Số buổi nghỉ</th>
              <th>Danh hiệu</th>
              <th>Lên lớp</th>
            </tr>
          </thead>
          <tbody>
            {termRows.map(([label, term]) => (
              <tr key={label}>
                <td>
                  <b>{label}</b>
                </td>
                <td className="num">{level(term?.academic)}</td>
                <td className="num">{level(term?.conduct)}</td>
                <td className="num">{term?.absentDays ?? ''}</td>
                <td className="num">{term?.title ?? ''}</td>
                <td className="num">{promotionText(term)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.retakes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <b>Kiểm tra lại:</b>{' '}
            {data.retakes.map((r) => `${r.name}: ${r.assessment === 'COMMENT' ? (r.passed === null ? 'chưa có kết quả' : passedLabel(r.passed)) : r.score === null ? 'chưa có kết quả' : fmtMark(r.score)}`).join('; ')}
            {t.year?.academicAfterRetake && `. Kết quả học tập sau kiểm tra lại: ${level(t.year.academicAfterRetake)}`}.
          </div>
        )}
        {data.training && (
          <div style={{ marginTop: 8 }}>
            <div>
              <b>Rèn luyện trong hè:</b> {data.training.tasks}
            </div>
            {data.training.result && (
              <div>
                <b>Đánh giá lại sau rèn luyện hè:</b> {level(data.training.result)}
                {data.training.comment ? ` (${data.training.comment})` : ''}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <b>Nhận xét của giáo viên chủ nhiệm:</b>
          <div style={{ minHeight: 48, whiteSpace: 'pre-wrap' }}>{t.year?.homeroomComment ?? t.hk2?.homeroomComment ?? t.hk1?.homeroomComment ?? ''}</div>
        </div>

        {data.completion && (
          <div style={{ marginTop: 12, fontWeight: 700 }}>
            Xác nhận của Hiệu trưởng: Học sinh đã hoàn thành chương trình giáo dục trung học cơ sở (Quyết định số {data.completion.decisionNo} ngày {dmy(data.completion.decidedOn)}, số vào sổ {data.completion.registerNo}).
          </div>
        )}

        <div className="sign">
          <div>
            <div>
              <b>Giáo viên chủ nhiệm</b>
            </div>
            <div style={{ fontStyle: 'italic' }}>(Ký, ghi rõ họ tên)</div>
            <div style={{ marginTop: 56 }}>{data.homeroomTeacher?.fullName ?? ''}</div>
          </div>
          <div>
            <div>
              <b>Hiệu trưởng</b>
            </div>
            <div style={{ fontStyle: 'italic' }}>(Ký, đóng dấu)</div>
          </div>
        </div>
      </div>
    </>
  );
}

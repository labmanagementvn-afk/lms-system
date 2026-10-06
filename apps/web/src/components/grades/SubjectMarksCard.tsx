'use client';

import { Card, Descriptions, Empty, Space, Tag, Typography } from 'antd';
import { fmtMark, OutcomeCell, PassedTag, PromotionTag, ResultLevelTag } from './ResultLevelTag';

export interface SubjectMarks {
  subjectId: string;
  code: string;
  name: string;
  assessment: 'SCORE' | 'COMMENT';
  regularCount: number;
  // Semester view
  marks?: { TX: (number | null)[]; GK: number | null; CK: number | null };
  passedMarks?: { TX: (boolean | null)[]; GK: boolean | null; CK: boolean | null };
  note?: string | null;
  // Year view
  hk1?: { average: number | null; passed: boolean | null };
  hk2?: { average: number | null; passed: boolean | null };
  average: number | null;
  passed: boolean | null;
}

export interface TermResult {
  academic: string | null;
  conduct: string | null;
  title: string | null;
  promotion: string | null;
  absentDays: number;
  homeroomComment: string | null;
}

const MarkChip = ({ label, value }: { label: string; value: string }) => (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 40, padding: '2px 6px', borderRadius: 6, background: '#f1f5f9' }}>
    <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </span>
);

/** One subject in the student / parent app: regular, mid-term and end-of-term marks and the average. */
export function SubjectMarksCard({ subject, year }: { subject: SubjectMarks; year: boolean }) {
  const comment = subject.assessment === 'COMMENT';
  const cell = (v: number | null | undefined, p: boolean | null | undefined) => (comment ? (p === null || p === undefined ? '—' : p ? 'Đ' : 'CĐ') : fmtMark(v));
  return (
    <Card
      size="small"
      title={
        <Space>
          <span>{subject.name}</span>
          {comment && <Tag style={{ margin: 0 }}>Nhận xét</Tag>}
        </Space>
      }
      extra={<OutcomeCell assessment={subject.assessment} average={subject.average} passed={subject.passed} />}
      styles={{ body: { padding: '8px 12px' } }}
    >
      {year ? (
        <Space wrap size={6}>
          <MarkChip label="HK1" value={cell(subject.hk1?.average, subject.hk1?.passed)} />
          <MarkChip label="HK2" value={cell(subject.hk2?.average, subject.hk2?.passed)} />
          <MarkChip label="CN" value={cell(subject.average, subject.passed)} />
        </Space>
      ) : (
        <>
          <Space wrap size={6}>
            {(subject.marks?.TX ?? []).map((v, i) => (
              <MarkChip key={i} label={`TX${i + 1}`} value={cell(v, subject.passedMarks?.TX[i])} />
            ))}
            <MarkChip label="GK" value={cell(subject.marks?.GK, subject.passedMarks?.GK)} />
            <MarkChip label="CK" value={cell(subject.marks?.CK, subject.passedMarks?.CK)} />
          </Space>
          {subject.note && (
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
              Nhận xét: {subject.note}
            </Typography.Paragraph>
          )}
        </>
      )}
    </Card>
  );
}

/** Academic and conduct levels, title and promotion of a term, when the school has computed them. */
export function TermResultCard({ term, year }: { term: TermResult | null; year: boolean }) {
  if (!term || (!term.academic && !term.conduct && !term.title)) return null;
  return (
    <Card size="small" title="Kết quả" styles={{ body: { padding: '8px 12px' } }}>
      <Descriptions size="small" column={2} colon={false}>
        <Descriptions.Item label="Học tập">
          <ResultLevelTag level={term.academic} />
        </Descriptions.Item>
        <Descriptions.Item label="Rèn luyện">
          <ResultLevelTag level={term.conduct} />
        </Descriptions.Item>
        {year && (
          <>
            <Descriptions.Item label="Danh hiệu">{term.title ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Lên lớp">
              <PromotionTag status={term.promotion} />
            </Descriptions.Item>
          </>
        )}
        <Descriptions.Item label="Nghỉ học">{term.absentDays} buổi</Descriptions.Item>
        {term.homeroomComment && (
          <Descriptions.Item label="GVCN" span={2}>
            {term.homeroomComment}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
}

/** Semester / year marks list shared by the student and parent apps. */
export function MarksList({ data, year, loading }: { data?: { subjects: SubjectMarks[]; term: TermResult | null }; year: boolean; loading: boolean }) {
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <TermResultCard term={data.term} year={year} />
      {data.subjects.length === 0 && !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có điểm" style={{ margin: '32px 0' }} />}
      {data.subjects.map((s) => (
        <SubjectMarksCard key={s.subjectId} subject={s} year={year} />
      ))}
    </div>
  );
}

export { PassedTag };

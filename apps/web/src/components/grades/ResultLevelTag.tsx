'use client';

import { Tag, Typography } from 'antd';
import { PROMOTION_STATUS, RESULT_LEVEL } from '@/lib/labels';

/** "8.5" -> "8,5"; null -> "—". */
export const fmtMark = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ','));

/** Đạt / Chưa đạt of a comment-assessed subject. */
export const passedLabel = (p: boolean | null | undefined) => (p === null || p === undefined ? '—' : p ? 'Đạt' : 'Chưa đạt');

const Dash = () => <Typography.Text type="secondary">—</Typography.Text>;

/** Tốt / Khá / Đạt / Chưa đạt. */
export function ResultLevelTag({ level }: { level: string | null | undefined }) {
  if (!level) return <Dash />;
  const l = RESULT_LEVEL[level];
  return (
    <Tag color={l?.color} style={{ margin: 0 }}>
      {l?.label ?? level}
    </Tag>
  );
}

/** Được lên lớp / Kiểm tra lại / Ở lại lớp. */
export function PromotionTag({ status }: { status: string | null | undefined }) {
  if (!status) return <Dash />;
  const l = PROMOTION_STATUS[status];
  return (
    <Tag color={l?.color} style={{ margin: 0 }}>
      {l?.label ?? status}
    </Tag>
  );
}

/** Đạt / Chưa đạt of a comment subject. */
export function PassedTag({ passed }: { passed: boolean | null | undefined }) {
  if (passed === null || passed === undefined) return <Dash />;
  return (
    <Tag color={passed ? 'green' : 'red'} style={{ margin: 0 }}>
      {passed ? 'Đạt' : 'Chưa đạt'}
    </Tag>
  );
}

/** A subject outcome: the average of a score subject or Đạt/Chưa đạt of a comment subject. */
export function OutcomeCell({ assessment, average, passed }: { assessment: string; average: number | null; passed: boolean | null }) {
  if (assessment === 'COMMENT') return <PassedTag passed={passed} />;
  if (average === null || average === undefined) return <Dash />;
  return <span style={{ fontWeight: 600, color: average < 5 ? '#dc2626' : average >= 8 ? '#16a34a' : undefined }}>{fmtMark(average)}</span>;
}

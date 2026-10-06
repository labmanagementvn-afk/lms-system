'use client';

import { Tag } from 'antd';
import { CONDUCT_STATUS, RESULT_LEVEL } from '@/lib/labels';

/** Coloured level tag (Tốt / Khá / Đạt / Chưa đạt); a dash when not yet approved. */
export function ConductLevelTag({ level, size }: { level: string | null | undefined; size?: 'large' }) {
  if (!level) return <span style={{ color: '#9ca3af' }}>—</span>;
  const l = RESULT_LEVEL[level] ?? { label: level, color: 'default' };
  return (
    <Tag color={l.color} style={size === 'large' ? { fontSize: 16, padding: '4px 12px', margin: 0 } : { margin: 0 }}>
      {l.label}
    </Tag>
  );
}

/** Workflow status tag (chưa đánh giá / HS đã tự đánh giá / GVCN đã đánh giá / đã duyệt). */
export function ConductStatusTag({ status }: { status: string | null | undefined }) {
  if (!status) return <Tag style={{ margin: 0 }}>Chưa mở</Tag>;
  const s = CONDUCT_STATUS[status] ?? { label: status, color: 'default' };
  return (
    <Tag color={s.color} style={{ margin: 0 }}>
      {s.label}
    </Tag>
  );
}

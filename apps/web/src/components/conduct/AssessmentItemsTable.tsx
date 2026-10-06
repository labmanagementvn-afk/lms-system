'use client';

import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AssessmentItem, groupBy } from './types';

type Row = { key: string; kind: 'group'; name: string; max: number; self: number; teacher: number } | ({ key: string; kind: 'item' } & AssessmentItem);

/** Read-only criteria table with the student's and the teacher's points side by side, grouped by criterion group. */
export function AssessmentItemsTable({ items, showTeacher = true, compact }: { items: AssessmentItem[]; showTeacher?: boolean; compact?: boolean }) {
  const rows: Row[] = [];
  for (const g of groupBy(items, (i) => i.criterion.groupName, (i) => i.criterion.sortOrder)) {
    rows.push({
      key: `g:${g.name}`,
      kind: 'group',
      name: g.name,
      max: g.rows.reduce((s, i) => s + i.criterion.maxPoints, 0),
      self: g.rows.reduce((s, i) => s + Math.min(i.selfPoints ?? 0, i.criterion.maxPoints), 0),
      teacher: g.rows.reduce((s, i) => s + Math.min(i.teacherPoints ?? 0, i.criterion.maxPoints), 0),
    });
    for (const i of g.rows) rows.push({ key: i.criterionId, kind: 'item', ...i });
  }
  const num = (v: number | null) => (v == null ? <span style={{ color: '#9ca3af' }}>—</span> : v);
  const columns: ColumnsType<Row> = [
    {
      title: 'Tiêu chí',
      render: (_, r) =>
        r.kind === 'group' ? (
          <Typography.Text strong>{r.name}</Typography.Text>
        ) : (
          <div>
            <div>{r.criterion.name}</div>
            {r.note && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.note}</Typography.Text>}
          </div>
        ),
    },
    { title: 'Tối đa', width: compact ? 56 : 80, align: 'center', render: (_, r) => (r.kind === 'group' ? <b>{r.max}</b> : r.criterion.maxPoints) },
    { title: compact ? 'HS' : 'HS tự chấm', width: compact ? 56 : 100, align: 'center', render: (_, r) => (r.kind === 'group' ? <b>{r.self}</b> : num(r.selfPoints)) },
    ...(showTeacher
      ? [{ title: compact ? 'GVCN' : 'GVCN chấm', width: compact ? 60 : 100, align: 'center' as const, render: (_: unknown, r: Row) => (r.kind === 'group' ? <b>{r.teacher}</b> : num(r.teacherPoints)) }]
      : []),
  ];
  return (
    <Table<Row>
      rowKey="key"
      size="small"
      pagination={false}
      dataSource={rows}
      columns={columns}
      onRow={(r) => ({ style: r.kind === 'group' ? { background: '#f8fafc' } : undefined })}
    />
  );
}

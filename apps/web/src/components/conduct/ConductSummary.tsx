'use client';

import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import useSWR from 'swr';
import { CONDUCT_STATUS, RESULT_LEVEL } from '@/lib/labels';

interface Row {
  class: { id: string; name: string; gradeLevel: number; homeroomTeacher: { id: string; fullName: string } | null };
  students: number;
  status: Record<string, number>;
  level: Record<string, number>;
}
interface Summary {
  academicYear: { id: string; name: string };
  semester: number;
  rows: Row[];
  totals: { students: number; status: Record<string, number>; level: Record<string, number> };
}

const LEVELS = ['TOT', 'KHA', 'DAT', 'CHUA_DAT'];
const STATUSES = ['DRAFT', 'SELF_ASSESSED', 'REVIEWED', 'APPROVED'];

/** Per class of the current year: how far the semester round got and how many students reached each level. */
export function ConductSummary({ semester }: { semester: number }) {
  const { data, isLoading } = useSWR<Summary>(['/conduct/summary', { semester }]);
  const opened = (r: { students: number; status: Record<string, number> }) => STATUSES.reduce((s, k) => s + (r.status[k] ?? 0), 0);
  const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '');
  const countCell = (n: number, color: string, total: number) =>
    n ? (
      <span>
        <Tag color={color} style={{ margin: 0 }}>
          {n}
        </Tag>{' '}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {pct(n, total)}
        </Typography.Text>
      </span>
    ) : (
      <span style={{ color: '#9ca3af' }}>0</span>
    );

  const columns: ColumnsType<Row> = [
    { title: 'Lớp', width: 90, render: (_, r) => <b>{r.class.name}</b> },
    { title: 'GVCN', width: 180, render: (_, r) => r.class.homeroomTeacher?.fullName ?? <span style={{ color: '#9ca3af' }}>—</span> },
    { title: 'Sĩ số', width: 70, align: 'center', render: (_, r) => r.students },
    { title: 'Chưa mở', width: 90, align: 'center', render: (_, r) => r.students - opened(r) || <span style={{ color: '#9ca3af' }}>0</span> },
    ...STATUSES.map((k) => ({ title: CONDUCT_STATUS[k].label, width: 130, align: 'center' as const, render: (_: unknown, r: Row) => countCell(r.status[k] ?? 0, CONDUCT_STATUS[k].color, r.students) })),
    ...LEVELS.map((k) => ({ title: RESULT_LEVEL[k].label, width: 110, align: 'center' as const, render: (_: unknown, r: Row) => countCell(r.level[k] ?? 0, RESULT_LEVEL[k].color, r.students) })),
  ];

  return (
    <>
      {data && (
        <Typography.Paragraph type="secondary">
          Năm học {data.academicYear.name} · Học kỳ {data.semester} · đánh giá cả học kỳ (không tính các đợt theo tháng)
        </Typography.Paragraph>
      )}
      <Table<Row>
        rowKey={(r) => r.class.id}
        loading={isLoading}
        dataSource={data?.rows ?? []}
        size="small"
        pagination={false}
        scroll={{ x: 1200 }}
        columns={columns}
        summary={() =>
          data && (
            <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 600 }}>
              <Table.Summary.Cell index={0} colSpan={2}>
                Toàn trường
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="center">
                {data.totals.students}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="center">
                {data.totals.students - opened(data.totals)}
              </Table.Summary.Cell>
              {STATUSES.map((k, i) => (
                <Table.Summary.Cell key={k} index={4 + i} align="center">
                  {data.totals.status[k] ?? 0}
                </Table.Summary.Cell>
              ))}
              {LEVELS.map((k, i) => (
                <Table.Summary.Cell key={k} index={8 + i} align="center">
                  {countCell(data.totals.level[k] ?? 0, RESULT_LEVEL[k].color, data.totals.students)}
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          )
        }
      />
    </>
  );
}

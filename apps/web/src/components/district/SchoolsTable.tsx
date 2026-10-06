'use client';

import { Table, Tag, Typography } from 'antd';
import Link from 'next/link';

export interface DistrictSchoolRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  province: string | null;
  moetCode: string | null;
  students: number;
  teachers: number;
  classes: number;
  openAlerts: number;
  stat: {
    present: number;
    late: number;
    absent: number;
    attendanceRate: number | null;
    lateRate: number;
    homeroomAbsent: number;
    revenue: number;
    overdueAmount: number;
    healthIncidents: number;
    lmsActiveStudents: number;
    testsSubmitted: number;
  } | null;
}

const pct = (v: number) => `${v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const vnd = (v: number) => v.toLocaleString('vi-VN');

/** Status colors are reserved for state: the attendance cell turns amber below 90% and red below 80%. */
function rateTag(v: number | null | undefined) {
  if (v === undefined || v === null) return <Typography.Text type="secondary">—</Typography.Text>;
  return <Tag color={v < 80 ? 'red' : v < 90 ? 'orange' : 'green'}>{pct(v)}</Tag>;
}

/** One line per school of the district for a day: head counts, attendance, fees and open alerts. */
export function SchoolsTable({ rows, loading, full = false }: { rows: DistrictSchoolRow[] | undefined; loading?: boolean; full?: boolean }) {
  return (
    <Table<DistrictSchoolRow>
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      pagination={false}
      scroll={{ x: true }}
      locale={{ emptyText: 'Chưa có trường nào gắn với Phòng/Sở. Trường tự gắn trong Thiết lập › Trường học.' }}
      columns={[
        {
          title: 'Trường',
          dataIndex: 'name',
          render: (n: string, r) => (
            <>
              <Link href={`/district/schools/${r.id}`}>{n}</Link>
              <div style={{ fontSize: 12 }}>
                <Typography.Text type="secondary">
                  {r.code}
                  {r.moetCode ? ` · CSDL ngành ${r.moetCode}` : ''}
                </Typography.Text>
              </div>
            </>
          ),
        },
        { title: 'Học sinh', dataIndex: 'students', align: 'right', width: 90 },
        { title: 'Giáo viên', dataIndex: 'teachers', align: 'right', width: 90 },
        { title: 'Lớp', dataIndex: 'classes', align: 'right', width: 70 },
        { title: 'Chuyên cần', width: 110, align: 'center', render: (_, r) => rateTag(r.stat?.attendanceRate) },
        { title: 'Đi muộn', width: 90, align: 'right', render: (_, r) => (r.stat ? `${r.stat.late} (${pct(r.stat.lateRate)})` : '—') },
        { title: 'Vắng', dataIndex: ['stat', 'absent'], width: 70, align: 'right', render: (v?: number) => v ?? '—' },
        ...(full
          ? [
              { title: 'Nghỉ (GVCN điểm danh)', dataIndex: ['stat', 'homeroomAbsent'], width: 120, align: 'right' as const, render: (v?: number) => v ?? '—' },
              { title: 'Thu trong ngày (₫)', dataIndex: ['stat', 'revenue'], width: 130, align: 'right' as const, render: (v?: number) => (v === undefined ? '—' : vnd(v)) },
              { title: 'Sự cố y tế', dataIndex: ['stat', 'healthIncidents'], width: 90, align: 'right' as const, render: (v?: number) => v ?? '—' },
              { title: 'HS học e-learning', dataIndex: ['stat', 'lmsActiveStudents'], width: 120, align: 'right' as const, render: (v?: number) => v ?? '—' },
            ]
          : []),
        { title: 'Công nợ quá hạn (₫)', dataIndex: ['stat', 'overdueAmount'], width: 150, align: 'right', render: (v?: number) => (v === undefined ? '—' : v ? <Typography.Text type="danger">{vnd(v)}</Typography.Text> : '0') },
        {
          title: 'Cảnh báo',
          dataIndex: 'openAlerts',
          width: 90,
          align: 'center',
          render: (n: number, r) => (n ? <Link href={`/district/alerts?schoolId=${r.id}`}><Tag color="red">{n}</Tag></Link> : <Tag>0</Tag>),
        },
      ]}
    />
  );
}

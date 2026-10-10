'use client';

import { Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import useSWR from 'swr';
import { useClasses } from '@/lib/hooks';
import { ReportButtons } from './ReportButtons';

interface MissingRow {
  studentId: string;
  code: string;
  fullName: string;
  subject: string;
  teacher: string;
  missing: string[];
}

/** Học sinh thiếu điểm: per student and subject of a class, the mark columns still empty. */
export function MissingTab({ semester, classId, onClassChange }: { semester: number; classId?: string; onClassChange: (id?: string) => void }) {
  const { data: classes } = useClasses();
  const { data, isLoading } = useSWR<{ class: { name: string }; rows: MissingRow[] }>(classId ? ['/grades/monitor/missing', { classId, semester }] : null);
  const className = classes?.find((c) => c.id === classId)?.name;

  const columns: ColumnsType<MissingRow> = [
    { title: 'Mã HS', dataIndex: 'code', width: 110 },
    { title: 'Họ và tên', dataIndex: 'fullName', width: 200 },
    { title: 'Môn học', dataIndex: 'subject', width: 180 },
    { title: 'Giáo viên', dataIndex: 'teacher', width: 180 },
    {
      title: 'Cột còn thiếu',
      render: (_, r) => (
        <Space size={4} wrap>
          {r.missing.map((m) => (
            <Tag key={m} color="orange" style={{ margin: 0 }}>
              {m}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <Select
          placeholder="Chọn lớp"
          value={classId}
          onChange={onClassChange}
          style={{ width: 160 }}
          showSearch
          optionFilterProp="label"
          options={(classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))}
        />
        <ReportButtons report="missing-scores" query={{ classId, semester }} fileName={`hoc-sinh-thieu-diem-${(className ?? 'lop').replace(/[^0-9A-Za-z]+/g, '-')}-hk${semester}`} disabled={!classId} />
      </Space>
      {classId ? (
        <Table<MissingRow>
          rowKey={(r) => `${r.studentId}|${r.subject}`}
          size="small"
          loading={isLoading}
          dataSource={data?.rows ?? []}
          columns={columns}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: 'Lớp đã nhập đủ điểm' }}
          scroll={{ x: 'max-content' }}
        />
      ) : (
        <Typography.Text type="secondary">Chọn lớp để xem học sinh còn thiếu điểm.</Typography.Text>
      )}
    </>
  );
}

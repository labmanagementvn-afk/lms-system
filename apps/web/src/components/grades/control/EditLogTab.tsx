'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { useClasses, useSubjects } from '@/lib/hooks';
import { ReportButtons } from './ReportButtons';

interface Edit {
  id: string;
  createdAt: string;
  class: string;
  subject: string;
  studentCode: string;
  studentName: string;
  column: string;
  oldValue: string;
  newValue: string;
  isChange: boolean;
  editedBy: string;
  source: 'MANUAL' | 'IMPORT';
}

/** Thống kê sửa điểm: every mark written, with the old and new value, who wrote it and how. */
export function EditLogTab({ semester }: { semester: number }) {
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [classId, setClassId] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();
  const [changesOnly, setChangesOnly] = useState(true);
  const { data, isLoading } = useSWR<Edit[]>(['/grades/edits', { semester, classId, subjectId, changesOnly }]);

  const columns: ColumnsType<Edit> = [
    { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    { title: 'Lớp', dataIndex: 'class', width: 80 },
    { title: 'Môn học', dataIndex: 'subject', width: 150 },
    { title: 'Học sinh', width: 220, render: (_, r) => `${r.studentCode} - ${r.studentName}` },
    { title: 'Cột', dataIndex: 'column', width: 70 },
    {
      title: 'Điểm',
      width: 140,
      render: (_, r) => (
        <Space size={6}>
          {r.isChange ? <Typography.Text delete type="secondary">{r.oldValue || '(trống)'}</Typography.Text> : <Typography.Text type="secondary">mới</Typography.Text>}
          <ArrowRightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
          <b>{r.newValue || '(trống)'}</b>
        </Space>
      ),
    },
    { title: 'Người sửa', dataIndex: 'editedBy', width: 180 },
    { title: 'Cách nhập', dataIndex: 'source', width: 110, render: (s: Edit['source']) => (s === 'IMPORT' ? <Tag color="purple">Từ Excel</Tag> : <Tag>Nhập tay</Tag>) },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select allowClear placeholder="Mọi lớp" value={classId} onChange={setClassId} style={{ width: 140 }} showSearch optionFilterProp="label" options={(classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
          <Select allowClear placeholder="Mọi môn" value={subjectId} onChange={setSubjectId} style={{ width: 200 }} showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <Space size={6}>
            <Switch size="small" checked={changesOnly} onChange={setChangesOnly} />
            <span>Chỉ lần sửa điểm đã nhập</span>
          </Space>
        </Space>
        <ReportButtons report="score-edits" query={{ semester, classId, subjectId }} fileName={`thong-ke-sua-diem-hk${semester}`} />
      </Space>
      <Table<Edit>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        columns={columns}
        pagination={{ pageSize: 50, hideOnSinglePage: true, showTotal: (n) => `${n} lần` }}
        locale={{ emptyText: changesOnly ? 'Chưa có điểm nào bị sửa' : 'Chưa có điểm nào được nhập' }}
        scroll={{ x: 'max-content' }}
      />
    </>
  );
}

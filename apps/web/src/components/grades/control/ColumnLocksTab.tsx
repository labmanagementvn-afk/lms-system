'use client';

import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useSubjects } from '@/lib/hooks';

interface Lock {
  id: string;
  gradeLevel: number;
  subjectId: string | null;
  subjectName: string | null;
  kind: 'TX' | 'GK' | 'CK';
  index: number;
  column: string;
  lockedAt: string;
}

interface Values {
  gradeLevels: number[];
  subjectId?: string;
  kind: 'TX' | 'GK' | 'CK';
  index: number;
}

/** Khóa cột điểm: lock one mark column (TXn, every TX, GK or CK) of a grade level, in one subject or all. */
export function ColumnLocksTab({ semester, canEdit, gradeLevels }: { semester: number; canEdit: boolean; gradeLevels: number[] }) {
  const { message } = App.useApp();
  const { data: subjects } = useSubjects();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const { data, isLoading, mutate } = useSWR<Lock[]>(['/grades/column-locks', { semester, gradeLevel }]);
  const [form] = Form.useForm<Values>();
  const kind = Form.useWatch('kind', form);
  const [busy, setBusy] = useState(false);

  async function lock() {
    const v = await form.validateFields();
    setBusy(true);
    try {
      for (const g of v.gradeLevels) {
        await api('/grades/column-locks', { method: 'POST', body: { semester, gradeLevel: g, subjectId: v.subjectId, kind: v.kind, index: v.kind === 'TX' ? v.index : 0 } });
      }
      message.success('Đã khóa cột điểm');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock(id: string) {
    try {
      await api(`/grades/column-locks/${id}`, { method: 'DELETE' });
      message.success('Đã mở khóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const columns: ColumnsType<Lock> = [
    { title: 'Khối', dataIndex: 'gradeLevel', width: 80, render: (g: number) => `Khối ${g}` },
    { title: 'Môn học', render: (_, r) => r.subjectName ?? <Tag color="blue">Tất cả các môn</Tag> },
    {
      title: 'Cột điểm',
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <LockOutlined style={{ color: '#d97706' }} />
          <b>{r.column}</b>
        </Space>
      ),
    },
    { title: 'Khóa lúc', dataIndex: 'lockedAt', width: 150, render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    ...(canEdit
      ? [
          {
            title: '',
            width: 110,
            render: (_: unknown, r: Lock) => (
              <Popconfirm title={`Mở khóa cột ${r.column}?`} okText="Mở khóa" cancelText="Không" onConfirm={() => unlock(r.id)}>
                <Button size="small" icon={<UnlockOutlined />}>
                  Mở khóa
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Typography.Paragraph type="secondary">
        Cột đã khóa không ai sửa được, kể cả nhà trường; mở khóa khi cần sửa. Khóa từng cột giúp chốt điểm giữa kỳ, cuối kỳ mà giáo viên vẫn nhập tiếp các cột khác.
      </Typography.Paragraph>
      {canEdit && (
        <Card size="small" title="Khóa cột điểm" style={{ marginBottom: 16 }}>
          <Form form={form} layout="inline" initialValues={{ kind: 'GK', index: 0 }} style={{ rowGap: 8 }}>
            <Form.Item name="gradeLevels" rules={[{ required: true, message: 'Chọn khối' }]}>
              <Select mode="multiple" placeholder="Khối" style={{ minWidth: 160 }} options={gradeLevels.map((g) => ({ value: g, label: `Khối ${g}` }))} />
            </Form.Item>
            <Form.Item name="subjectId">
              <Select allowClear placeholder="Tất cả các môn" style={{ width: 200 }} showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <Form.Item name="kind">
              <Select
                style={{ width: 150 }}
                options={[
                  { value: 'TX', label: 'Thường xuyên' },
                  { value: 'GK', label: 'Giữa kỳ' },
                  { value: 'CK', label: 'Cuối kỳ' },
                ]}
              />
            </Form.Item>
            {kind === 'TX' && (
              <Form.Item name="index">
                <Select style={{ width: 150 }} options={[{ value: 0, label: 'Mọi cột TX' }, ...Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `TX${i + 1}` }))]} />
              </Form.Item>
            )}
            <Button type="primary" icon={<LockOutlined />} loading={busy} onClick={lock}>
              Khóa
            </Button>
          </Form>
        </Card>
      )}
      <Space style={{ marginBottom: 8 }}>
        <Select allowClear placeholder="Mọi khối" value={gradeLevel} onChange={setGradeLevel} style={{ width: 140 }} options={gradeLevels.map((g) => ({ value: g, label: `Khối ${g}` }))} />
      </Space>
      <Table<Lock> rowKey="id" size="small" loading={isLoading} dataSource={data ?? []} columns={columns} pagination={false} locale={{ emptyText: 'Chưa khóa cột nào trong học kỳ này' }} />
    </>
  );
}

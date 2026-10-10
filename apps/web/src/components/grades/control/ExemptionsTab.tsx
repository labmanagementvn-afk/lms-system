'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, Popconfirm, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import useSWR from 'swr';
import { StudentSelect } from '@/components/StudentSelect';
import { api } from '@/lib/api';
import { useClasses, useSubjects } from '@/lib/hooks';
import { SEMESTER } from '@/lib/labels';
import { ReportButtons } from './ReportButtons';

interface Exemption {
  id: string;
  semester: number;
  reason: string | null;
  student: { id: string; code: string; fullName: string };
  subject: { id: string; name: string };
}

interface Values {
  studentId: string;
  subjectId: string;
  semester: number;
  reason?: string;
}

/** Miễn học: students exempt from a subject for a semester or the year; their results leave the subject out. */
export function ExemptionsTab({ canEdit }: { canEdit: boolean }) {
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [classId, setClassId] = useState<string>();
  const { data, isLoading, mutate } = useSWR<Exemption[]>(['/grades/exemptions', { classId }]);
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = await form.validateFields();
    setBusy(true);
    try {
      await api('/grades/exemptions', { method: 'POST', body: { ...v, reason: v.reason || undefined } });
      message.success('Đã ghi miễn học; kết quả học tập của học sinh đã được tính lại');
      form.resetFields(['studentId', 'reason']);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/grades/exemptions/${id}`, { method: 'DELETE' });
      message.success('Đã bỏ miễn học');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const columns: ColumnsType<Exemption> = [
    { title: 'Mã HS', width: 110, render: (_, r) => r.student.code },
    { title: 'Họ và tên', width: 200, render: (_, r) => <b>{r.student.fullName}</b> },
    { title: 'Môn học', width: 180, render: (_, r) => r.subject.name },
    { title: 'Phạm vi', dataIndex: 'semester', width: 110, render: (s: number) => <Tag color={s === 0 ? 'blue' : 'default'}>{SEMESTER[s]}</Tag> },
    { title: 'Lý do', dataIndex: 'reason', render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text> },
    ...(canEdit
      ? [
          {
            title: '',
            width: 60,
            render: (_: unknown, r: Exemption) => (
              <Popconfirm title={`Bỏ miễn học môn ${r.subject.name} của ${r.student.fullName}?`} okText="Bỏ miễn" cancelText="Không" onConfirm={() => remove(r.id)}>
                <Button size="small" danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Typography.Paragraph type="secondary">
        Học sinh miễn học không phải nhập điểm môn đó; sổ điểm ghi MG và môn được bỏ ra khi xếp loại kết quả học tập, danh hiệu.
      </Typography.Paragraph>
      {canEdit && (
        <Card size="small" title="Thêm học sinh miễn học" style={{ marginBottom: 16 }}>
          <Form form={form} layout="inline" initialValues={{ semester: 0 }} style={{ rowGap: 8 }}>
            <Form.Item name="studentId" rules={[{ required: true, message: 'Chọn học sinh' }]}>
              <StudentSelect style={{ width: 300 }} />
            </Form.Item>
            <Form.Item name="subjectId" rules={[{ required: true, message: 'Chọn môn' }]}>
              <Select placeholder="Môn học" style={{ width: 200 }} showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <Form.Item name="semester">
              <Segmented options={[0, 1, 2].map((s) => ({ value: s, label: SEMESTER[s] }))} />
            </Form.Item>
            <Form.Item name="reason">
              <Input placeholder="Lý do (giấy xác nhận của bệnh viện…)" style={{ width: 240 }} maxLength={500} />
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} loading={busy} onClick={add}>
              Thêm
            </Button>
          </Form>
        </Card>
      )}
      <Space wrap style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <Select allowClear placeholder="Mọi lớp" value={classId} onChange={setClassId} style={{ width: 160 }} showSearch optionFilterProp="label" options={(classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
        <ReportButtons report="exemptions" query={{ classId }} fileName="danh-sach-hoc-sinh-mien-hoc" />
      </Space>
      <Table<Exemption> rowKey="id" size="small" loading={isLoading} dataSource={data ?? []} columns={columns} pagination={{ pageSize: 50, hideOnSinglePage: true }} locale={{ emptyText: 'Chưa có học sinh miễn học' }} />
    </>
  );
}

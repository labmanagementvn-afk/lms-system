'use client';

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ReportButtons } from '@/components/grades/control/ReportButtons';
import { PromotionTag, ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RESULT_LEVEL } from '@/lib/labels';
import { Scope, TrainingList, TrainingStudent } from './types';

/** Rèn luyện trong hè: tasks the homeroom teacher sets for conduct at Chưa đạt, and the re-evaluation. */
export function TrainingTab({ scope, scopeName, office }: { scope: Scope; scopeName: string; office: boolean }) {
  const { message } = App.useApp();
  const { me } = useAuth();
  const { data, isLoading, mutate } = useSWR<TrainingList>(['/grades/review/training', scope]);
  const [editing, setEditing] = useState<TrainingStudent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form] = Form.useForm();

  const canEdit = (s: TrainingStudent) => office || (!!me?.teacherId && s.homeroomTeacherId === me.teacherId);

  function open(s: TrainingStudent) {
    setEditing(s);
    form.setFieldsValue({ tasks: s.training?.tasks ?? '', result: s.training?.result ?? null, comment: s.training?.comment ?? '' });
  }
  async function save() {
    const v = await form.validateFields();
    if (!editing) return;
    setBusy('save');
    try {
      await api(`/grades/review/training/${editing.id}`, { method: 'PUT', body: { tasks: v.tasks, result: v.result ?? null, comment: v.comment?.trim() || null } });
      await mutate();
      message.success('Đã lưu');
      setEditing(null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function remove(s: TrainingStudent) {
    try {
      await api(`/grades/review/training/${s.id}`, { method: 'DELETE' });
      await mutate();
      message.success('Đã xóa nhiệm vụ rèn luyện hè');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const columns: ColumnsType<TrainingStudent> = [
    { title: '#', width: 44, render: (_, __, i) => i + 1 },
    { title: 'Họ và tên', width: 190, render: (_, s) => <Link href={`/grades/transcript/${s.id}`}>{s.fullName}</Link> },
    { title: 'Lớp', width: 64, align: 'center', render: (_, s) => s.class.name },
    { title: 'Học tập', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.academic} /> },
    { title: 'Rèn luyện', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.conduct} /> },
    {
      title: 'Nhiệm vụ rèn luyện trong hè',
      render: (_, s) =>
        s.training ? (
          <Typography.Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: s.training.tasks }}>
            {s.training.tasks}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="warning">Chưa giao</Typography.Text>
        ),
    },
    {
      title: 'Đánh giá lại',
      width: 110,
      align: 'center',
      render: (_, s) => (
        <Tooltip title={s.training?.comment ?? undefined}>
          <span>
            <ResultLevelTag level={s.training?.result} />
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Lên lớp',
      width: 130,
      align: 'center',
      render: (_, s) =>
        s.decides ? (
          <PromotionTag status={s.promotion} review="TRAINING" />
        ) : (
          <Tooltip title={s.absentDays > 45 ? `Nghỉ ${s.absentDays} buổi (quá 45 buổi)` : 'Học tập cũng Chưa đạt'}>
            <span>
              <PromotionTag status={s.promotion} />
            </span>
          </Tooltip>
        ),
    },
    {
      title: '',
      width: 84,
      render: (_, s) => (
        <Space size={4}>
          {canEdit(s) && (
            <Tooltip title={s.training ? 'Sửa, đánh giá lại' : 'Giao nhiệm vụ'}>
              <Button size="small" icon={<EditOutlined />} onClick={() => open(s)} />
            </Tooltip>
          )}
          {office && s.training && (
            <Popconfirm title="Xóa nhiệm vụ rèn luyện hè của học sinh?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove(s)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const s = data?.summary;
  return (
    <>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        {s ? (
          <Space size={4} wrap>
            <Tag>Học sinh {s.students}</Tag>
            <Tag color={s.assigned < s.students ? 'warning' : undefined}>Đã giao nhiệm vụ {s.assigned}</Tag>
            <Tag color="blue">Đã đánh giá lại {s.evaluated}</Tag>
            <Tag color="green">Lên lớp sau rèn luyện hè {s.promoted}</Tag>
            <Tag color="red">Ở lại lớp {s.retained}</Tag>
          </Space>
        ) : (
          <span />
        )}
        <ReportButtons label="Danh sách rèn luyện hè" report="summer-training" query={scope} fileName={`ren-luyen-he-${scopeName}`} />
      </Space>
      <Table<TrainingStudent>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.students ?? []}
        columns={columns}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="Không có học sinh rèn luyện cả năm Chưa đạt" /> }}
      />
      <Modal title={editing ? `Rèn luyện trong hè · ${editing.fullName}` : ''} open={!!editing} onCancel={() => setEditing(null)} onOk={save} okText="Lưu" cancelText="Hủy" confirmLoading={busy === 'save'} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          Giáo viên chủ nhiệm giao nhiệm vụ rèn luyện trong hè; cuối hè đánh giá lại kết quả rèn luyện cả năm (Điều 13 Thông tư 22/2021). Đạt trở lên thì được lên lớp.
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="tasks" label="Nhiệm vụ rèn luyện" rules={[{ required: true, whitespace: true, message: 'Nhập nhiệm vụ rèn luyện' }]}>
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="result" label="Đánh giá lại kết quả rèn luyện cả năm">
            <Select allowClear placeholder="Chưa đánh giá" options={['TOT', 'KHA', 'DAT', 'CHUA_DAT'].map((l) => ({ value: l, label: RESULT_LEVEL[l].label }))} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="comment" label="Nhận xét">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

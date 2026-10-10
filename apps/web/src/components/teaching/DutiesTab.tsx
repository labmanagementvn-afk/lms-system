'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAllTeachers } from '@/lib/hooks';
import { DUTY_KIND, periods } from '@/lib/labels';
import { DutyType, periodInput, TeacherDuty } from '@/lib/teaching';

const TERM = [
  { value: 0, label: 'Cả năm' },
  { value: 1, label: 'Học kỳ I' },
  { value: 2, label: 'Học kỳ II' },
];

/** Chức vụ, kiêm nhiệm: who holds which position or duty this school year, for the year or one semester. */
export function DutiesTab({ admin }: { admin: boolean }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<{ academicYear: { name: string }; items: TeacherDuty[] }>(['/teaching/duties']);
  const { data: types } = useSWR<DutyType[]>(['/teaching/duty-types']);
  const { data: teachers } = useAllTeachers();
  const [kind, setKind] = useState<string>();
  const [teacherId, setTeacherId] = useState<string>();
  const [editing, setEditing] = useState<TeacherDuty | 'new' | null>(null);
  const [form] = Form.useForm();
  const dutyTypeId = Form.useWatch('dutyTypeId', form);

  const items = useMemo(() => (data?.items ?? []).filter((d) => (!kind || d.dutyType.kind === kind) && (!teacherId || d.teacher.id === teacherId)), [data, kind, teacherId]);
  const typeOptions = useMemo(
    () =>
      Object.entries(DUTY_KIND).map(([k, v]) => ({
        label: v.label,
        options: (types ?? []).filter((t) => t.kind === k && (t.active || t.id === dutyTypeId)).map((t) => ({ value: t.id, label: `${t.name} (${periods(t.periods)} tiết)` })),
      })),
    [types, dutyTypeId],
  );
  const chosen = types?.find((t) => t.id === dutyTypeId);

  function open(d?: TeacherDuty) {
    form.resetFields();
    if (d) form.setFieldsValue({ teacherId: d.teacher.id, dutyTypeId: d.dutyType.id, semester: d.semester ?? 0, periods: d.periods, note: d.note });
    else form.setFieldsValue({ semester: 0 });
    setEditing(d ?? 'new');
  }

  async function save() {
    const v = await form.validateFields();
    const body = { teacherId: v.teacherId, dutyTypeId: v.dutyTypeId, semester: v.semester || null, periods: v.periods ?? null, note: v.note?.trim() || null };
    try {
      if (editing && editing !== 'new') await api(`/teaching/duties/${editing.id}`, { method: 'PATCH', body });
      else await api('/teaching/duties', { method: 'POST', body });
      message.success('Đã lưu nhiệm vụ');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/teaching/duties/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="Tất cả giáo viên" style={{ width: 240 }} showSearch optionFilterProp="label" value={teacherId} onChange={setTeacherId} options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: t.fullName }))} />
        <Select allowClear placeholder="Mọi loại nhiệm vụ" style={{ width: 180 }} value={kind} onChange={setKind} options={Object.entries(DUTY_KIND).map(([value, v]) => ({ value, label: v.label }))} />
        {admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            Giao nhiệm vụ
          </Button>
        )}
        {data && <Typography.Text type="secondary">Năm học {data.academicYear.name}</Typography.Text>}
      </Space>
      <Table<TeacherDuty>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={items}
        pagination={false}
        columns={[
          { title: 'Giáo viên', render: (_, d) => `${d.teacher.fullName} (${d.teacher.code})` },
          { title: 'Tổ chuyên môn', render: (_, d) => d.teacher.subjectGroup ?? '' },
          { title: 'Nhiệm vụ', render: (_, d) => <Tag color={DUTY_KIND[d.dutyType.kind]?.color}>{d.dutyType.name}</Tag> },
          { title: 'Thời gian', width: 110, render: (_, d) => (d.semester ? `Học kỳ ${d.semester === 1 ? 'I' : 'II'}` : 'Cả năm') },
          {
            title: 'Tiết/tuần',
            width: 120,
            align: 'center',
            render: (_, d) => (
              <>
                {periods(d.effectivePeriods)}
                {d.periods !== null && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {' '}
                    (riêng)
                  </Typography.Text>
                )}
              </>
            ),
          },
          { title: 'Ghi chú', dataIndex: 'note' },
          ...(admin
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, d: TeacherDuty) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(d)} aria-label="Sửa" />
                      <Popconfirm title="Xóa nhiệm vụ này?" onConfirm={() => remove(d.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing === 'new' ? 'Giao chức vụ, nhiệm vụ kiêm nhiệm' : 'Sửa nhiệm vụ'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="teacherId" label="Giáo viên" rules={[{ required: true, message: 'Chọn giáo viên' }]}>
            <Select showSearch optionFilterProp="label" options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})` }))} />
          </Form.Item>
          <Form.Item name="dutyTypeId" label="Chức vụ, nhiệm vụ" rules={[{ required: true, message: 'Chọn nhiệm vụ' }]} extra={chosen?.basis}>
            <Select showSearch optionFilterProp="label" options={typeOptions} />
          </Form.Item>
          <Form.Item name="semester" label="Thời gian">
            <Segmented options={TERM} />
          </Form.Item>
          <Form.Item
            name="periods"
            label={chosen?.kind === 'POSITION' ? 'Định mức riêng của người này (tiết/tuần)' : 'Số tiết được giảm riêng của người này (tiết/tuần)'}
            extra={chosen ? `Bỏ trống để dùng số tiết của danh mục: ${periods(chosen.periods)} tiết/tuần.` : undefined}
          >
            <InputNumber {...periodInput} min={0} max={40} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú" extra="Ví dụ: phòng thí nghiệm Vật lý, trường có 30 lớp">
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

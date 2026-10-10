'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { DUTY_KIND, options, periods } from '@/lib/labels';
import { DutyType, periodInput, WorkloadSetting } from '@/lib/teaching';

const KIND_LABEL = Object.fromEntries(Object.entries(DUTY_KIND).map(([k, v]) => [k, v.label]));

/** The school's norms and its catalogue of positions and duties, which starts as the circular's list. */
export function CatalogueTab({ admin }: { admin: boolean }) {
  const { message } = App.useApp();
  const { data: types, isLoading, mutate } = useSWR<DutyType[]>(['/teaching/duty-types']);
  const { data: setting, mutate: mutateSetting } = useSWR<WorkloadSetting>(['/teaching/workload/settings']);
  const [editing, setEditing] = useState<DutyType | 'new' | null>(null);
  const [form] = Form.useForm();
  const [norms] = Form.useForm();

  useEffect(() => {
    if (setting) norms.setFieldsValue({ teacherNorm: setting.teacherNorm, homeroomReduction: setting.homeroomReduction });
  }, [setting, norms]);

  function open(t?: DutyType) {
    form.resetFields();
    form.setFieldsValue(t ? { ...t } : { kind: 'CONCURRENT', active: true });
    setEditing(t ?? 'new');
  }

  async function save() {
    const v = await form.validateFields();
    const body = { code: v.code, name: v.name, kind: v.kind, periods: v.periods, basis: v.basis?.trim() || undefined, active: v.active };
    try {
      if (editing && editing !== 'new') await api(`/teaching/duty-types/${editing.id}`, { method: 'PATCH', body });
      else await api('/teaching/duty-types', { method: 'POST', body });
      message.success('Đã lưu danh mục');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/teaching/duty-types/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function saveNorms(reset = false) {
    try {
      const next = reset ? await api('/teaching/workload/settings', { method: 'DELETE' }) : await api('/teaching/workload/settings', { method: 'PUT', body: await norms.validateFields() });
      mutateSetting(next, { revalidate: false });
      message.success(reset ? 'Đã dùng lại định mức của Thông tư' : 'Đã lưu định mức của trường');
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    }
  }

  return (
    <>
      <Card size="small" title="Định mức tiết dạy của trường" style={{ marginBottom: 16 }}>
        {setting && (
          <Typography.Paragraph type="secondary">
            Cấp học: {setting.levelName}. Theo Thông tư 05/2025/TT-BGDĐT, định mức là {periods(setting.defaults.teacherNorm)} tiết/tuần và giáo viên chủ nhiệm được giảm {periods(setting.defaults.homeroomReduction)} tiết/tuần.
            Trường phổ thông dân tộc nội trú, trường chuyên biệt có thể đặt định mức riêng.
          </Typography.Paragraph>
        )}
        <Form form={norms} layout="inline" disabled={!admin}>
          <Form.Item name="teacherNorm" label="Định mức giáo viên (tiết/tuần)" rules={[{ required: true }]}>
            <InputNumber {...periodInput} min={1} max={40} />
          </Form.Item>
          <Form.Item name="homeroomReduction" label="Giảm cho giáo viên chủ nhiệm" rules={[{ required: true }]}>
            <InputNumber {...periodInput} min={0} max={20} />
          </Form.Item>
          {admin && (
            <Space>
              <Button type="primary" onClick={() => saveNorms()}>
                Lưu
              </Button>
              {setting?.custom && (
                <Popconfirm title="Dùng lại định mức của Thông tư?" onConfirm={() => saveNorms(true)}>
                  <Button icon={<UndoOutlined />}>Theo Thông tư</Button>
                </Popconfirm>
              )}
            </Space>
          )}
        </Form>
        {setting?.custom && <Tag color="gold" style={{ marginTop: 8 }}>Đang dùng định mức riêng của trường</Tag>}
      </Card>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Text strong>Danh mục chức vụ, kiêm nhiệm</Typography.Text>
        {admin && (
          <Button icon={<PlusOutlined />} onClick={() => open()}>
            Thêm
          </Button>
        )}
      </Space>
      <Table<DutyType>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={types}
        pagination={false}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 80 },
          { title: 'Tên', dataIndex: 'name', render: (n, t) => (t.active ? n : <Typography.Text delete>{n}</Typography.Text>) },
          { title: 'Loại', dataIndex: 'kind', width: 120, render: (k) => <Tag color={DUTY_KIND[k]?.color}>{DUTY_KIND[k]?.label}</Tag> },
          { title: 'Tiết/tuần', dataIndex: 'periods', width: 120, align: 'center', render: (p, t) => (t.kind === 'POSITION' ? `${periods(p)} (định mức)` : `-${periods(p)}`) },
          { title: 'Căn cứ', dataIndex: 'basis', render: (b) => <Typography.Text type="secondary">{b}</Typography.Text> },
          { title: 'Đang giao', dataIndex: 'used', width: 90, align: 'center' },
          ...(admin
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, t: DutyType) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(t)} aria-label="Sửa" />
                      <Popconfirm title="Xóa khỏi danh mục?" description={t.used ? 'Nhiệm vụ đang được giao: hãy ngừng sử dụng thay vì xóa.' : undefined} onConfirm={() => remove(t.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing === 'new' ? 'Thêm chức vụ, nhiệm vụ' : 'Sửa danh mục'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space.Compact block>
            <Form.Item name="code" label="Mã" rules={[{ required: true }, { pattern: /^[A-Za-z0-9_-]+$/, message: 'Chữ không dấu, số, - và _' }]} style={{ width: '30%' }}>
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item name="name" label="Tên" rules={[{ required: true }]} style={{ width: '70%' }}>
              <Input maxLength={120} />
            </Form.Item>
          </Space.Compact>
          <Space wrap>
            <Form.Item name="kind" label="Loại" rules={[{ required: true }]} extra="Chức vụ đặt định mức riêng; kiêm nhiệm và chế độ khác giảm định mức.">
              <Select options={options(KIND_LABEL)} style={{ width: 160 }} disabled={editing !== 'new' && editing !== null && editing.used > 0} />
            </Form.Item>
            <Form.Item name="periods" label="Số tiết/tuần" rules={[{ required: true }]}>
              <InputNumber {...periodInput} min={0} max={40} />
            </Form.Item>
            <Form.Item name="active" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="basis" label="Căn cứ">
            <Input maxLength={300} placeholder="Điều 9 Thông tư 05/2025/TT-BGDĐT" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

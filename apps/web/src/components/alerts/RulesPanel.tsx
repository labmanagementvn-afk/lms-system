'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ALERT_KIND } from '@/lib/labels';

export interface AlertRule {
  id: string;
  kind: string;
  name: string;
  threshold: string | number;
  isActive: boolean;
  schoolId: string | null;
  districtId: string | null;
  _count?: { events: number };
}

export const formatThreshold = (kind: string, value: number | string) => {
  const n = Number(value);
  const unit = ALERT_KIND[kind]?.unit ?? '';
  return unit === '₫' ? `${n.toLocaleString('vi-VN')} ₫` : unit === '%' ? `${n}%` : `${n} ${unit}`;
};

/**
 * Quy tắc cảnh báo: thresholds on the daily statistics. `endpoint` is /alerts/rules (school)
 * or /district/rules (district-wide, applied to every school of the district).
 */
export function RulesPanel({ endpoint, canEdit, title }: { endpoint: string; canEdit: boolean; title?: string }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<AlertRule[]>([endpoint]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const kind = Form.useWatch('kind', form);

  async function create() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await api(endpoint, { method: 'POST', body: { kind: v.kind, name: v.name, threshold: v.threshold } });
      message.success('Đã thêm quy tắc');
      setOpen(false);
      form.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: AlertRule, isActive: boolean) {
    try {
      await api(`${endpoint}/${r.id}`, { method: 'PATCH', body: { isActive } });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(r: AlertRule) {
    try {
      await api(`${endpoint}/${r.id}`, { method: 'DELETE' });
      message.success('Đã xóa quy tắc');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text type="secondary">{title ?? 'Quy tắc được kiểm tra mỗi đêm trên số liệu của ngày hôm trước; mỗi quy tắc phát sinh tối đa một cảnh báo mỗi ngày.'}</Typography.Text>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Thêm quy tắc
          </Button>
        )}
      </div>
      <Table<AlertRule>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        locale={{ emptyText: 'Chưa có quy tắc nào' }}
        columns={[
          { title: 'Tên', dataIndex: 'name', render: (n: string, r) => <>{n}{r.districtId && <Tag style={{ marginLeft: 8 }}>Phòng/Sở</Tag>}</> },
          { title: 'Điều kiện', render: (_, r) => `${ALERT_KIND[r.kind]?.label ?? r.kind} ${formatThreshold(r.kind, r.threshold)}` },
          { title: 'Đã phát sinh', dataIndex: ['_count', 'events'], width: 110, align: 'right' },
          {
            title: 'Hoạt động',
            width: 100,
            render: (_, r) => (canEdit && !(r.districtId && endpoint.startsWith('/alerts')) ? <Switch size="small" checked={r.isActive} onChange={(v) => toggle(r, v)} /> : <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? 'Bật' : 'Tắt'}</Tag>),
          },
          ...(canEdit
            ? [
                {
                  title: '',
                  width: 50,
                  render: (_: unknown, r: AlertRule) => (
                    <Popconfirm title="Xóa quy tắc và các cảnh báo đã phát sinh của nó?" onConfirm={() => remove(r)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title="Thêm quy tắc cảnh báo" open={open} onCancel={() => setOpen(false)} onOk={create} okText="Thêm" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ kind: 'ATTENDANCE_RATE_BELOW', threshold: 90 }}>
          <Form.Item name="kind" label="Loại" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ALERT_KIND).map(([value, k]) => ({ value, label: k.label }))}
              onChange={(k) => form.setFieldsValue({ threshold: k === 'OVERDUE_FEES_ABOVE' ? 20_000_000 : k === 'HEALTH_INCIDENTS_ABOVE' ? 2 : k === 'ABSENT_STREAK' ? 3 : k === 'LATE_RATE_ABOVE' ? 10 : 90, name: `${ALERT_KIND[k].label} ` })}
            />
          </Form.Item>
          {kind && <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>{ALERT_KIND[kind]?.hint}</Typography.Paragraph>}
          <Form.Item name="threshold" label={`Ngưỡng (${ALERT_KIND[kind ?? 'ATTENDANCE_RATE_BELOW']?.unit})`} rules={[{ required: true, message: 'Nhập ngưỡng' }]}>
            <InputNumber min={0} style={{ width: '100%' }} decimalSeparator="," formatter={(v) => (kind === 'OVERDUE_FEES_ABOVE' ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : `${v}`)} parser={(v) => Number(`${v}`.replace(/\./g, '')) as any} />
          </Form.Item>
          <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="Chuyên cần dưới 90%" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

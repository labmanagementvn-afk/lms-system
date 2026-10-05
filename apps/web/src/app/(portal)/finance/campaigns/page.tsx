'use client';

import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space, Switch, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { useClasses } from '@/lib/hooks';
import { CAMPAIGN_STATUS, vnd } from '@/lib/labels';

export default function CampaignsPage() {
  const { message, modal } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/finance/campaigns']);
  const { data: feeItems } = useSWR<any[]>(['/finance/fee-items']);
  const { data: classes } = useClasses();
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const grades = [...new Set(classes?.map((c) => c.gradeLevel))].sort((a, b) => a - b);

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(
      record
        ? {
            ...record,
            dueDate: dayjs(record.dueDate),
            items: record.items.map((i: any) => ({ feeItemId: i.feeItemId, amount: i.amount, quantity: i.quantity })),
          }
        : { carryOverDebt: true, items: [{}] },
    );
  }

  async function save() {
    const values = await form.validateFields();
    const body = { ...values, dueDate: values.dueDate.format('YYYY-MM-DD'), items: values.items.map((i: any) => clean(i)) };
    try {
      if (editing?.id) await api(`/finance/campaigns/${editing.id}`, { method: 'PATCH', body });
      else await api('/finance/campaigns', { method: 'POST', body });
      message.success('Đã lưu đợt thu');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function run(fn: () => Promise<any>, ok: (r: any) => string) {
    try {
      const r = await fn();
      message.success(ok(r));
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function generate(c: any) {
    try {
      const p = await api(`/finance/campaigns/${c.id}/preview`);
      modal.confirm({
        title: `Phát hành "${c.name}"?`,
        content: `Lập hóa đơn cho ${p.students - p.alreadyInvoiced} học sinh (${p.alreadyInvoiced} đã có hóa đơn). Mỗi học sinh ${vnd(p.perStudentBeforeDiscount)} trước miễn giảm${c.carryOverDebt ? ', cộng nợ kỳ trước nếu có' : ''}.`,
        okText: 'Lập hóa đơn',
        cancelText: 'Hủy',
        onOk: () => run(() => api(`/finance/campaigns/${c.id}/generate`, { method: 'POST' }), (r) => `Đã lập ${r.created} hóa đơn`),
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Đợt thu"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            Tạo đợt thu
          </Button>
        }
      />
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Tên đợt thu', render: (_, r) => <Link href={`/finance/invoices?campaignId=${r.id}`}>{r.name}</Link> },
          { title: 'Hạn nộp', dataIndex: 'dueDate', width: 110, render: (d) => dayjs(d).format('DD/MM/YYYY') },
          {
            title: 'Phạm vi',
            render: (_, r) =>
              r.classIds.length
                ? r.classIds.map((id: string) => <Tag key={id}>{classes?.find((c) => c.id === id)?.name ?? '?'}</Tag>)
                : r.gradeLevels.length
                  ? r.gradeLevels.map((g: number) => <Tag key={g}>Khối {g}</Tag>)
                  : 'Toàn trường',
          },
          { title: 'Khoản thu', render: (_, r) => r.items.map((i: any) => <Tag key={i.id}>{i.feeItem.name}</Tag>) },
          { title: 'Hóa đơn', dataIndex: 'invoiceCount', width: 90, align: 'right' },
          {
            title: 'Đã thu / phải thu',
            width: 220,
            render: (_, r) => (
              <>
                {vnd(r.collected)} / {vnd(r.billed)}
                <Progress size="small" percent={r.billed ? Math.round((r.collected / r.billed) * 100) : 0} />
              </>
            ),
          },
          { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (s) => <Tag color={CAMPAIGN_STATUS[s].color}>{CAMPAIGN_STATUS[s].label}</Tag> },
          {
            title: '',
            width: 230,
            render: (_, r) => (
              <Space wrap>
                {r.status !== 'CLOSED' && (
                  <Button size="small" type="primary" onClick={() => generate(r)}>
                    {r.status === 'DRAFT' ? 'Phát hành' : 'Lập bổ sung'}
                  </Button>
                )}
                {r.status === 'DRAFT' && (
                  <>
                    <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                    <Popconfirm title="Xóa đợt thu nháp?" onConfirm={() => run(() => api(`/finance/campaigns/${r.id}`, { method: 'DELETE' }), () => 'Đã xóa')}>
                      <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                    </Popconfirm>
                  </>
                )}
                {r.status === 'PUBLISHED' && (
                  <Popconfirm title="Đóng đợt thu? Không lập thêm hóa đơn được nữa." onConfirm={() => run(() => api(`/finance/campaigns/${r.id}/close`, { method: 'POST' }), () => 'Đã đóng')}>
                    <Button size="small">Đóng</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa đợt thu' : 'Tạo đợt thu'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={720} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="name" label="Tên đợt thu" rules={[{ required: true }]}>
              <Input style={{ width: 360 }} placeholder="Học phí tháng 10/2026" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn nộp" rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="gradeLevels" label="Khối (bỏ trống = tất cả)">
              <Select mode="multiple" style={{ width: 220 }} options={grades.map((g) => ({ value: g, label: `Khối ${g}` }))} />
            </Form.Item>
            <Form.Item name="classIds" label="Lớp (bỏ trống = tất cả)">
              <Select mode="multiple" style={{ width: 300 }} options={classes?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Space>
          <Form.Item name="carryOverDebt" label="Cộng dồn nợ các kỳ trước vào hóa đơn mới" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'feeItemId']} rules={[{ required: true, message: 'Chọn khoản thu' }]}>
                      <Select
                        placeholder="Khoản thu"
                        style={{ width: 260 }}
                        options={feeItems?.filter((i) => i.isActive).map((i) => ({ value: i.id, label: `${i.name} (${vnd(i.defaultAmount)})` }))}
                      />
                    </Form.Item>
                    <Form.Item name={[f.name, 'amount']}>
                      <InputNumber min={0} placeholder="Đơn giá (mặc định)" style={{ width: 170 }} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'quantity']}>
                      <InputNumber min={1} placeholder="SL" style={{ width: 80 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(f.name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Thêm khoản thu
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

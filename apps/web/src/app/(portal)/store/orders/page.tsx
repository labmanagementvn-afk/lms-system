'use client';

import { CloseCircleOutlined, EyeOutlined, MinusCircleOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { INVOICE_STATUS, ORDER_STATUS, vnd } from '@/lib/labels';

function StudentSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useSWR<any>(['/students', { q, pageSize: 20 }]);
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      filterOption={false}
      onSearch={setQ}
      loading={isLoading}
      placeholder="Tìm theo tên hoặc mã học sinh"
      options={data?.items.map((s: any) => ({ value: s.id, label: `${s.code} - ${s.fullName}${s.enrollments[0] ? ` (${s.enrollments[0].class.name})` : ''}` }))}
    />
  );
}

export default function StoreOrdersPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/store/orders', query]);
  const { data: items } = useSWR<any>(['/store/items', { pageSize: 200, isActive: true }]);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const lines: { itemId?: string; quantity?: number }[] = Form.useWatch('lines', form) ?? [];
  const itemById = new Map<string, any>((items?.items ?? []).map((i: any) => [i.id, i]));
  const liveTotal = lines.reduce((s, l) => s + (l?.itemId && l.quantity ? (itemById.get(l.itemId)?.price ?? 0) * l.quantity : 0), 0);

  function openCreate() {
    form.resetFields();
    form.setFieldsValue({ lines: [{ quantity: 1 }] });
    setCreating(true);
  }

  async function create() {
    const values = await form.validateFields();
    try {
      const order = await api('/store/orders', { method: 'POST', body: { ...values, note: values.note || undefined } });
      message.success(`Đã tạo đơn ${order.code}`);
      setCreating(false);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function act(order: any, action: 'issue' | 'cancel') {
    try {
      const updated = await api(`/store/orders/${order.id}/${action}`, { method: 'POST' });
      message.success(action === 'issue' ? 'Đã cấp phát và trừ tồn kho' : 'Đã hủy đơn');
      if (viewing?.id === order.id) setViewing(updated);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const actions = (r: any) =>
    r.status === 'PENDING' && (
      <Space>
        <Popconfirm title="Cấp phát và trừ tồn kho?" onConfirm={() => act(r, 'issue')}>
          <Button size="small" type="primary" icon={<SendOutlined />}>
            Cấp phát
          </Button>
        </Popconfirm>
        <Popconfirm title="Hủy đơn và hóa đơn kèm theo?" onConfirm={() => act(r, 'cancel')}>
          <Button size="small" danger icon={<CloseCircleOutlined />}>
            Hủy
          </Button>
        </Popconfirm>
      </Space>
    );

  return (
    <>
      <PageHeader
        title="Phiếu cấp phát"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo đơn cấp phát
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo mã đơn, tên hoặc mã học sinh" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 320 }} />
        <Select
          placeholder="Trạng thái"
          allowClear
          options={Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          style={{ width: 180 }}
          onChange={(status) => setQuery({ ...query, status, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã đơn', dataIndex: 'code', width: 130 },
          { title: 'Ngày tạo', dataIndex: 'createdAt', width: 110, render: (d) => dayjs(d).format('DD/MM/YYYY') },
          { title: 'Học sinh', render: (_, r) => `${r.student.code} - ${r.student.fullName}` },
          { title: 'Số mặt hàng', width: 110, align: 'right', render: (_, r) => r.lines.reduce((s: number, l: any) => s + l.quantity, 0) },
          { title: 'Thành tiền', dataIndex: 'total', width: 130, align: 'right', render: vnd },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (s) => <Tag color={ORDER_STATUS[s]?.color}>{ORDER_STATUS[s]?.label}</Tag> },
          {
            title: 'Thanh toán',
            width: 140,
            render: (_, r) => r.invoice && <Tag color={INVOICE_STATUS[r.invoice.status]?.color}>{INVOICE_STATUS[r.invoice.status]?.label}</Tag>,
          },
          {
            title: '',
            width: 200,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewing(r)} aria-label="Xem" />
                {actions(r)}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="Tạo đơn cấp phát" open={creating} onOk={create} onCancel={() => setCreating(false)} okText="Tạo đơn" cancelText="Hủy" width={720} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="studentId" label="Học sinh" rules={[{ required: true, message: 'Chọn học sinh' }]}>
            <StudentSelect />
          </Form.Item>
          <Form.List name="lines" rules={[{ validator: async (_, v) => (v?.length ? undefined : Promise.reject(new Error('Thêm ít nhất một mặt hàng'))) }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map(({ key, name }) => {
                  const line = lines[name];
                  const item = line?.itemId ? itemById.get(line.itemId) : undefined;
                  return (
                    <Space key={key} align="baseline" wrap>
                      <Form.Item name={[name, 'itemId']} rules={[{ required: true, message: 'Chọn mặt hàng' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Mặt hàng"
                          style={{ width: 340 }}
                          options={items?.items.map((i: any) => ({ value: i.id, label: `${i.sku} - ${i.name} (tồn ${i.stockQty})` }))}
                        />
                      </Form.Item>
                      <Form.Item name={[name, 'quantity']} rules={[{ required: true, message: 'Nhập SL' }]}>
                        <InputNumber min={1} precision={0} style={{ width: 90 }} placeholder="SL" />
                      </Form.Item>
                      <span style={{ display: 'inline-block', width: 120, textAlign: 'right' }}>{item ? vnd(item.price * (line?.quantity ?? 0)) : ''}</span>
                      <MinusCircleOutlined onClick={() => remove(name)} aria-label="Bỏ" />
                    </Space>
                  );
                })}
                <Form.ErrorList errors={errors} />
                <Button type="dashed" onClick={() => add({ quantity: 1 })} icon={<PlusOutlined />}>
                  Thêm mặt hàng
                </Button>
              </>
            )}
          </Form.List>
          <Typography.Title level={5} style={{ textAlign: 'right', marginTop: 12 }}>
            Tổng cộng: {vnd(liveTotal)}
          </Typography.Title>
          <Form.Item name="note" label="Ghi chú">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={viewing ? `Đơn cấp phát ${viewing.code}` : ''} open={!!viewing} onClose={() => setViewing(null)} width={680} extra={viewing && actions(viewing)}>
        {viewing && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Học sinh" span={2}>
                {viewing.student.code} - {viewing.student.fullName}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={ORDER_STATUS[viewing.status]?.color}>{ORDER_STATUS[viewing.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">{dayjs(viewing.createdAt).format('DD/MM/YYYY HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="Ngày cấp phát">{viewing.issuedAt ? dayjs(viewing.issuedAt).format('DD/MM/YYYY HH:mm') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Thành tiền">{vnd(viewing.total)}</Descriptions.Item>
              {viewing.invoice && (
                <>
                  <Descriptions.Item label="Hóa đơn">
                    <Tag color={INVOICE_STATUS[viewing.invoice.status]?.color}>{INVOICE_STATUS[viewing.invoice.status]?.label}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Đã thu">{vnd(viewing.invoice.paidAmount)}</Descriptions.Item>
                  <Descriptions.Item label="Nội dung chuyển khoản" span={2}>
                    <Typography.Text copyable>{viewing.invoice.paymentRef}</Typography.Text>
                  </Descriptions.Item>
                </>
              )}
              {viewing.note && (
                <Descriptions.Item label="Ghi chú" span={2}>
                  {viewing.note}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Table<any>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={viewing.lines}
              columns={[
                { title: 'Mã hàng', render: (_, l) => l.item.sku, width: 110 },
                { title: 'Tên hàng', render: (_, l) => l.item.name },
                { title: 'SL', dataIndex: 'quantity', width: 60, align: 'right' },
                { title: 'Đơn giá', dataIndex: 'unitPrice', width: 110, align: 'right', render: vnd },
                { title: 'Thành tiền', dataIndex: 'amount', width: 120, align: 'right', render: vnd },
              ]}
            />
          </>
        )}
      </Drawer>
    </>
  );
}

'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { StudentSelect } from '@/components/StudentSelect';
import { api, clean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DISCOUNT_KIND, FEE_UNIT, options, vnd } from '@/lib/labels';

export default function FeeItemsPage() {
  return (
    <>
      <PageHeader title="Khoản thu & miễn giảm" />
      <Tabs
        items={[
          { key: 'items', label: 'Khoản thu', children: <FeeItems /> },
          { key: 'discounts', label: 'Miễn giảm theo học sinh', children: <Discounts /> },
        ]}
      />
    </>
  );
}

function FeeItems() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/finance/fee-items']);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(record ?? { unit: 'MONTH', isActive: true });
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing?.id) await api(`/finance/fee-items/${editing.id}`, { method: 'PATCH', body: values });
      else await api('/finance/fee-items', { method: 'POST', body: clean(values) });
      message.success('Đã lưu khoản thu');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/finance/fee-items/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => open()} style={{ marginBottom: 12 }}>
        Thêm khoản thu
      </Button>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 120 },
          { title: 'Tên khoản thu', dataIndex: 'name' },
          { title: 'Đơn vị', dataIndex: 'unit', width: 100, render: (u) => FEE_UNIT[u] },
          { title: 'Mức thu', dataIndex: 'defaultAmount', align: 'right', render: vnd },
          { title: 'Mã hạch toán', dataIndex: 'accountingCode', width: 130 },
          { title: '', dataIndex: 'isActive', width: 110, render: (a) => (a ? <Tag color="green">Đang áp dụng</Tag> : <Tag>Ngừng</Tag>) },
          {
            title: '',
            width: 96,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                {me?.role === 'ADMIN' && (
                  <Popconfirm title="Xóa khoản thu?" onConfirm={() => remove(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa khoản thu' : 'Thêm khoản thu'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Mã" rules={[{ required: true }]}>
            <Input placeholder="HOCPHI" />
          </Form.Item>
          <Form.Item name="name" label="Tên khoản thu" rules={[{ required: true }]}>
            <Input placeholder="Học phí" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="defaultAmount" label="Mức thu" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} addonAfter="₫" />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị">
              <Select options={options(FEE_UNIT)} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="accountingCode" label="Mã hạch toán (MISA)" extra="Tài khoản doanh thu hoặc mã khoản thu bên kế toán">
            <Input placeholder="5113" />
          </Form.Item>
          <Form.Item name="isActive" label="Đang áp dụng" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function Discounts() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '' });
  const { data, isLoading, mutate } = useSWR<any>(['/finance/discounts', query]);
  const { data: feeItems } = useSWR<any[]>(['/finance/fee-items']);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  async function save() {
    const values = await form.validateFields();
    try {
      await api('/finance/discounts', {
        method: 'POST',
        body: clean({ ...values, validFrom: values.validFrom?.format('YYYY-MM-DD'), validTo: values.validTo?.format('YYYY-MM-DD') }),
      });
      message.success('Đã thêm miễn giảm');
      setOpen(false);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/finance/discounts/${id}`, { method: 'DELETE' });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm học sinh" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 240 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => (form.resetFields(), form.setFieldsValue({ kind: 'PERCENT' }), setOpen(true))}>
          Thêm miễn giảm
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Học sinh', render: (_, r) => `${r.student.code} - ${r.student.fullName}` },
          { title: 'Khoản thu', render: (_, r) => r.feeItem?.name ?? 'Tất cả khoản thu' },
          { title: 'Mức giảm', render: (_, r) => (r.kind === 'PERCENT' ? `${r.value}%` : vnd(r.value)) },
          { title: 'Lý do', dataIndex: 'reason' },
          {
            title: 'Hiệu lực',
            render: (_, r) => [r.validFrom && `từ ${dayjs(r.validFrom).format('DD/MM/YYYY')}`, r.validTo && `đến ${dayjs(r.validTo).format('DD/MM/YYYY')}`].filter(Boolean).join(' ') || 'Không thời hạn',
          },
          {
            title: '',
            width: 50,
            render: (_, r) => (
              <Popconfirm title="Xóa miễn giảm?" onConfirm={() => remove(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal title="Thêm miễn giảm" open={open} onOk={save} onCancel={() => setOpen(false)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="studentId" label="Học sinh" rules={[{ required: true }]}>
            <StudentSelect />
          </Form.Item>
          <Form.Item name="feeItemId" label="Khoản thu (bỏ trống = tất cả)">
            <Select allowClear options={feeItems?.map((i) => ({ value: i.id, label: i.name }))} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="kind" label="Hình thức">
              <Select options={options(DISCOUNT_KIND)} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="value" label="Mức giảm (% hoặc ₫)" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true }]}>
            <Input placeholder="Anh chị em ruột cùng học tại trường" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="validFrom" label="Từ ngày">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="validTo" label="Đến ngày">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}

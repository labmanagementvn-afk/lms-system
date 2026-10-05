'use client';

import { DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { ITEM_CATEGORY, options, STOCK_MOVEMENT, vnd } from '@/lib/labels';

const LOW_STOCK = 5;

export default function StoreItemsPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', category: undefined as string | undefined, lowStock: undefined as number | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/store/items', query]);
  const [editing, setEditing] = useState<any | null>(null);
  const [stocking, setStocking] = useState<any | null>(null);
  const [history, setHistory] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [stockForm] = Form.useForm();

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(record ? { ...record, accountingCode: record.accountingCode ?? undefined } : { category: 'UNIFORM', unit: 'cái', isActive: true });
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing?.id) await api(`/store/items/${editing.id}`, { method: 'PATCH', body: clean(values) });
      else await api('/store/items', { method: 'POST', body: clean(values) });
      message.success('Đã lưu mặt hàng');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/store/items/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function openStock(record: any) {
    setStocking(record);
    stockForm.resetFields();
    stockForm.setFieldsValue({ type: 'IN', unitCost: record.price });
  }

  async function saveStock() {
    const values = await stockForm.validateFields();
    try {
      await api(`/store/items/${stocking.id}/stock`, { method: 'POST', body: clean(values) });
      message.success(values.type === 'IN' ? 'Đã nhập kho' : 'Đã điều chỉnh tồn kho');
      setStocking(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Hàng hóa & tồn kho"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            Thêm mặt hàng
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo mã hoặc tên" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select placeholder="Nhóm hàng" allowClear options={options(ITEM_CATEGORY)} style={{ width: 160 }} onChange={(category) => setQuery({ ...query, category, page: 1 })} />
        <Switch
          checkedChildren={`Tồn ≤ ${LOW_STOCK}`}
          unCheckedChildren="Tất cả tồn kho"
          onChange={(on) => setQuery({ ...query, lowStock: on ? LOW_STOCK : undefined, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã hàng', dataIndex: 'sku', width: 130 },
          {
            title: 'Tên hàng',
            dataIndex: 'name',
            render: (name, r) => (
              <>
                {name} {!r.isActive && <Tag>Ngừng sử dụng</Tag>}
              </>
            ),
          },
          { title: 'Nhóm', dataIndex: 'category', width: 110, render: (c) => ITEM_CATEGORY[c] },
          { title: 'Đơn vị', dataIndex: 'unit', width: 80 },
          { title: 'Giá bán', dataIndex: 'price', width: 130, align: 'right', render: vnd },
          {
            title: 'Tồn kho',
            dataIndex: 'stockQty',
            width: 100,
            align: 'right',
            render: (q) => (q <= LOW_STOCK ? <Tag color="red">{q}</Tag> : q),
          },
          {
            title: '',
            width: 150,
            render: (_, r) => (
              <Space>
                <Tooltip title="Nhập kho / Điều chỉnh">
                  <Button size="small" icon={<SwapOutlined />} onClick={() => openStock(r)} aria-label="Nhập kho / Điều chỉnh" />
                </Tooltip>
                <Tooltip title="Lịch sử nhập xuất">
                  <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistory(r)} aria-label="Lịch sử nhập xuất" />
                </Tooltip>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                <Popconfirm title="Xóa mặt hàng này?" onConfirm={() => remove(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={editing?.id ? 'Sửa mặt hàng' : 'Thêm mặt hàng'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space.Compact block>
            <Form.Item name="sku" label="Mã hàng" rules={[{ required: true }]} style={{ width: '35%' }}>
              <Input />
            </Form.Item>
            <Form.Item name="name" label="Tên hàng" rules={[{ required: true }]} style={{ width: '65%' }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space wrap>
            <Form.Item name="category" label="Nhóm hàng" rules={[{ required: true }]}>
              <Select options={options(ITEM_CATEGORY)} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị tính">
              <Input style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="price" label="Giá bán (₫)" rules={[{ required: true }]}>
              <InputNumber<number> min={0} step={1000} style={{ width: 160 }} formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number((v ?? '').replace(/\./g, ''))} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="accountingCode" label="Mã vật tư kế toán">
              <Input placeholder="Mặc định dùng mã hàng" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal title={stocking ? `Nhập kho / Điều chỉnh: ${stocking.name}` : ''} open={!!stocking} onOk={saveStock} onCancel={() => setStocking(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <p>
          Tồn hiện tại: <b>{stocking?.stockQty}</b> {stocking?.unit}
        </p>
        <Form form={stockForm} layout="vertical">
          <Form.Item name="type" label="Loại">
            <Radio.Group
              options={[
                { value: 'IN', label: 'Nhập kho' },
                { value: 'ADJUST', label: 'Điều chỉnh (kiểm kê)' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle dependencies={['type']}>
            {({ getFieldValue }) => {
              const isIn = getFieldValue('type') === 'IN';
              return (
                <Space wrap>
                  <Form.Item
                    name="quantity"
                    label={isIn ? 'Số lượng nhập' : 'Số lượng thay đổi (âm để giảm)'}
                    rules={[
                      { required: true, message: 'Nhập số lượng' },
                      { validator: (_, v) => (v === 0 ? Promise.reject(new Error('Số lượng phải khác 0')) : Promise.resolve()) },
                    ]}
                  >
                    <InputNumber min={isIn ? 1 : undefined} precision={0} style={{ width: 200 }} />
                  </Form.Item>
                  {isIn && (
                    <Form.Item name="unitCost" label="Đơn giá nhập (₫)">
                      <InputNumber min={0} step={1000} style={{ width: 160 }} />
                    </Form.Item>
                  )}
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item name="reason" label="Ghi chú / lý do">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <MovementsDrawer item={history} onClose={() => setHistory(null)} />
    </>
  );
}

function MovementsDrawer({ item, onClose }: { item: any; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<any>(item ? [`/store/items/${item.id}/movements`, { page, pageSize: 20 }] : null);
  return (
    <Drawer title={item ? `Lịch sử nhập xuất: ${item.name}` : ''} open={!!item} onClose={onClose} width={720} afterOpenChange={(o) => !o && setPage(1)}>
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
          { title: 'Loại', dataIndex: 'type', width: 100, render: (t) => <Tag color={t === 'IN' ? 'green' : t === 'OUT' ? 'blue' : 'orange'}>{STOCK_MOVEMENT[t]}</Tag> },
          { title: 'Số lượng', dataIndex: 'quantity', width: 90, align: 'right', render: (q) => (q > 0 ? `+${q}` : q) },
          { title: 'Đơn giá', dataIndex: 'unitCost', width: 110, align: 'right', render: (v) => (v != null ? vnd(v) : '') },
          {
            title: 'Diễn giải',
            render: (_, r) => (r.order ? `Đơn ${r.order.code} - ${r.order.student.fullName}` : (r.reason ?? '')),
          },
        ]}
      />
    </Drawer>
  );
}

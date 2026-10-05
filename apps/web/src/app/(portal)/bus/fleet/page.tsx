'use client';

import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Result, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { BUS_STAFF_ROLE, VEHICLE_STATUS, options } from '@/lib/labels';

const fmt = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');
const toDay = (d?: string | null) => (d ? dayjs(d) : undefined);

export default function FleetPage() {
  const { me } = useAuth();
  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Quản lý xe đưa đón dành cho văn phòng nhà trường." />;
  }
  return (
    <>
      <PageHeader title="Xe & lái xe" />
      <Tabs
        items={[
          { key: 'vehicles', label: 'Xe', children: <VehiclesTab /> },
          { key: 'staff', label: 'Lái xe & phụ xe', children: <StaffTab /> },
        ]}
      />
    </>
  );
}

/** Expiry date with a warning inside 30 days and an alarm once past. */
function ExpiryTag({ date, daysLeft }: { date: string | null; daysLeft: number | null }) {
  if (!date || daysLeft === null) return <Tag>Chưa có</Tag>;
  if (daysLeft < 0) return <Tag color="red">Hết hạn {fmt(date)}</Tag>;
  if (daysLeft <= 30) return <Tag color="orange">{fmt(date)} · còn {daysLeft} ngày</Tag>;
  return <span>{fmt(date)}</span>;
}

function VehiclesTab() {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/bus/vehicles']);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(
      record ? { ...record, inspectionExpiry: toDay(record.inspectionExpiry), insuranceExpiry: toDay(record.insuranceExpiry) } : { status: 'ACTIVE', capacity: 16 },
    );
  }

  async function save() {
    const values = await form.validateFields();
    const body = {
      ...values,
      inspectionExpiry: values.inspectionExpiry ? values.inspectionExpiry.format('YYYY-MM-DD') : null,
      insuranceExpiry: values.insuranceExpiry ? values.insuranceExpiry.format('YYYY-MM-DD') : null,
    };
    try {
      if (editing.id) await api(`/bus/vehicles/${editing.id}`, { method: 'PATCH', body });
      else await api('/bus/vehicles', { method: 'POST', body: clean(body) });
      message.success('Đã lưu xe');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/bus/vehicles/${id}`, { method: 'DELETE' });
      message.success('Đã xóa xe');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const warnings = (data ?? []).filter((v) => v.expiring.inspection || v.expiring.insurance);

  return (
    <>
      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${warnings.length} xe có đăng kiểm hoặc bảo hiểm hết hạn trong 30 ngày tới: ${warnings.map((v) => v.plateNumber).join(', ')}`}
        />
      )}
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
          Thêm xe
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: 'Biển số', dataIndex: 'plateNumber', width: 130, render: (v) => <b>{v}</b> },
          { title: 'Loại xe', dataIndex: 'model' },
          { title: 'Số chỗ', dataIndex: 'capacity', width: 80, align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', width: 140, render: (s) => <Tag color={VEHICLE_STATUS[s]?.color}>{VEHICLE_STATUS[s]?.label ?? s}</Tag> },
          { title: 'Hạn đăng kiểm', width: 200, render: (_, v) => <ExpiryTag date={v.inspectionExpiry} daysLeft={v.inspectionDaysLeft} /> },
          { title: 'Hạn bảo hiểm', width: 200, render: (_, v) => <ExpiryTag date={v.insuranceExpiry} daysLeft={v.insuranceDaysLeft} /> },
          { title: 'Tuyến', dataIndex: 'routeCount', width: 70, align: 'right' },
          {
            title: '',
            width: 96,
            render: (_, v) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(v)} aria-label="Sửa" />
                <Popconfirm title="Xóa xe này?" onConfirm={() => remove(v.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa xe' : 'Thêm xe'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="plateNumber" label="Biển số" rules={[{ required: true, message: 'Nhập biển số' }]} normalize={(v) => v?.toUpperCase()}>
              <Input placeholder="29B-123.45" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="capacity" label="Số chỗ" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={Object.entries(VEHICLE_STATUS).map(([value, s]) => ({ value, label: s.label }))} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="model" label="Loại xe">
            <Input placeholder="Ford Transit 16 chỗ" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="inspectionExpiry" label="Hạn đăng kiểm">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="insuranceExpiry" label="Hạn bảo hiểm">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function StaffTab() {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/bus/staff']);
  const [editing, setEditing] = useState<any | null>(null);
  const [creds, setCreds] = useState<{ fullName: string; phone: string; password: string } | null>(null);
  const [form] = Form.useForm();

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(record ? { ...record, licenseExpiry: toDay(record.licenseExpiry) } : { role: 'DRIVER', isActive: true });
  }

  async function save() {
    const values = await form.validateFields();
    const body = { ...values, licenseExpiry: values.licenseExpiry ? values.licenseExpiry.format('YYYY-MM-DD') : null };
    try {
      if (editing.id) await api(`/bus/staff/${editing.id}`, { method: 'PATCH', body });
      else await api('/bus/staff', { method: 'POST', body: clean(body) });
      message.success('Đã lưu nhân viên');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function createAccount(s: any) {
    try {
      const res = await api(`/bus/staff/${s.id}/account`, { method: 'POST' });
      setCreds({ fullName: s.fullName, phone: res.phone, password: res.password });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function resetPassword(s: any) {
    try {
      const res = await api(`/bus/staff/${s.id}/reset-password`, { method: 'POST' });
      setCreds({ fullName: s.fullName, phone: s.user.phone, password: res.password });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
          Thêm lái xe / phụ xe
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Họ và tên', dataIndex: 'fullName', render: (v, s) => (s.isActive ? v : <Typography.Text type="secondary">{v} (ngừng)</Typography.Text>) },
          { title: 'Vai trò', dataIndex: 'role', width: 100, render: (r) => <Tag color={r === 'DRIVER' ? 'blue' : 'cyan'}>{BUS_STAFF_ROLE[r]}</Tag> },
          { title: 'Điện thoại', dataIndex: 'phone', width: 130 },
          { title: 'GPLX', dataIndex: 'licenseNumber', width: 140 },
          { title: 'Hạn GPLX', width: 200, render: (_, s) => (s.role === 'DRIVER' ? <ExpiryTag date={s.licenseExpiry} daysLeft={s.licenseDaysLeft} /> : null) },
          { title: 'Tuyến', dataIndex: 'routeCount', width: 70, align: 'right' },
          {
            title: 'Tài khoản app',
            width: 180,
            render: (_, s) =>
              s.user ? (
                <Space size={4}>
                  <Tag color="green">{s.user.phone}</Tag>
                  {s.user.mustChangePassword && <Tag color="orange">Chưa đổi MK</Tag>}
                </Space>
              ) : (
                <Tag>Chưa có</Tag>
              ),
          },
          {
            title: '',
            width: 220,
            render: (_, s) => (
              <Space wrap>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(s)} aria-label="Sửa" />
                {s.user ? (
                  <Popconfirm title="Cấp mật khẩu mới cho tài khoản này?" onConfirm={() => resetPassword(s)}>
                    <Button size="small" icon={<KeyOutlined />}>
                      Đặt lại mật khẩu
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" icon={<UserAddOutlined />} onClick={() => createAccount(s)}>
                    Tạo tài khoản
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa nhân viên xe' : 'Thêm lái xe / phụ xe'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input />
          </Form.Item>
          <Space wrap>
            <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]} extra={editing?.user ? 'Tài khoản đăng nhập vẫn dùng số cũ' : 'Dùng để đăng nhập ứng dụng lái xe'}>
              <Input placeholder="0912000001" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
              <Select options={options(BUS_STAFF_ROLE)} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="isActive" label="Đang làm việc" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="licenseNumber" label="Số GPLX">
              <Input style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="licenseExpiry" label="Hạn GPLX">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
      <Modal
        title="Thông tin đăng nhập ứng dụng lái xe"
        open={!!creds}
        onCancel={() => setCreds(null)}
        footer={
          <Button type="primary" onClick={() => setCreds(null)}>
            Đã ghi lại
          </Button>
        }
      >
        {creds && (
          <>
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Mật khẩu chỉ hiển thị một lần. Gửi cho nhân viên và yêu cầu đổi mật khẩu ở lần đăng nhập đầu." />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Họ và tên">{creds.fullName}</Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                <Typography.Text copyable strong>
                  {creds.phone}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Mật khẩu">
                <Typography.Text copyable strong code>
                  {creds.password}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>
    </>
  );
}

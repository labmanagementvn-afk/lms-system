'use client';

import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { formatDateTime } from '@/components/lms/format';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Officer {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Officer accounts of the district: create colleagues, reset passwords, deactivate. */
export default function DistrictUsersPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<Officer[]>(['/district/users']);
  const [open, setOpen] = useState(false);
  const [reset, setReset] = useState<Officer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  async function create() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await api('/district/users', { method: 'POST', body: v });
      message.success(`Đã tạo tài khoản ${v.email}; người dùng sẽ phải đổi mật khẩu khi đăng nhập lần đầu`);
      setOpen(false);
      form.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(u: Officer, isActive: boolean) {
    try {
      await api(`/district/users/${u.id}`, { method: 'PATCH', body: { isActive } });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function resetPassword() {
    const v = await resetForm.validateFields();
    setSaving(true);
    try {
      await api(`/district/users/${reset!.id}`, { method: 'PATCH', body: { password: v.password } });
      message.success('Đã đặt lại mật khẩu');
      setReset(null);
      resetForm.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tài khoản chuyên viên"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Thêm tài khoản
          </Button>
        }
      />
      <Typography.Paragraph type="secondary">Chuyên viên đăng nhập bằng email và xem được mọi trường trực thuộc Phòng/Sở.</Typography.Paragraph>
      <Table<Officer>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Tạo lúc', dataIndex: 'createdAt', width: 150, render: (d: string) => formatDateTime(d, me!.school.timezone) },
          {
            title: 'Trạng thái',
            width: 200,
            render: (_, u) => (
              <>
                <Switch size="small" checked={u.isActive} disabled={u.id === me?.id} onChange={(v) => toggle(u, v)} />{' '}
                {u.isActive ? 'Hoạt động' : <Tag>Đã khóa</Tag>} {u.mustChangePassword && <Tag color="orange">Chờ đổi mật khẩu</Tag>}
              </>
            ),
          },
          {
            title: '',
            width: 160,
            render: (_, u) => (
              <Button size="small" icon={<KeyOutlined />} onClick={() => setReset(u)}>
                Đặt lại mật khẩu
              </Button>
            ),
          },
        ]}
      />
      <Modal title="Thêm tài khoản chuyên viên" open={open} onCancel={() => setOpen(false)} onOk={create} okText="Tạo" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu ban đầu" rules={[{ required: true, min: 8, message: 'Ít nhất 8 ký tự' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={reset ? `Đặt lại mật khẩu: ${reset.fullName}` : ''} open={!!reset} onCancel={() => setReset(null)} onOk={resetPassword} okText="Đặt lại" confirmLoading={saving} destroyOnHidden>
        <Form form={resetForm} layout="vertical">
          <Form.Item name="password" label="Mật khẩu mới" rules={[{ required: true, min: 8, message: 'Ít nhất 8 ký tự' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

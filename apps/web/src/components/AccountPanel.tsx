'use client';

import { App, Button, Card, Descriptions, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE } from '@/lib/labels';

/** Profile summary, password change and sign-out; shared by the portal and the mobile apps. */
export function AccountPanel({ onPasswordChanged }: { onPasswordChanged?: () => void }) {
  const { me, refresh, logout } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  if (!me) return null;

  async function onFinish(values: { currentPassword: string; newPassword: string }) {
    setSaving(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: values });
      message.success('Đã đổi mật khẩu');
      form.resetFields();
      await refresh();
      onPasswordChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small" title="Tài khoản">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Họ tên">{me.fullName}</Descriptions.Item>
          <Descriptions.Item label="Vai trò">{ROLE[me.role]}</Descriptions.Item>
          {me.email && <Descriptions.Item label="Email">{me.email}</Descriptions.Item>}
          {me.phone && <Descriptions.Item label="Điện thoại">{me.phone}</Descriptions.Item>}
          <Descriptions.Item label="Trường">{me.school.name}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card size="small" title="Đổi mật khẩu">
        {me.mustChangePassword && (
          <Typography.Paragraph type="warning">Bạn đang dùng mật khẩu do nhà trường cấp. Hãy đặt mật khẩu mới để tiếp tục.</Typography.Paragraph>
        )}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, min: 8, message: 'Ít nhất 8 ký tự' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Nhập lại mật khẩu mới"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu không khớp'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            Lưu mật khẩu
          </Button>
        </Form>
      </Card>
      <Button danger block onClick={logout}>
        Đăng xuất
      </Button>
    </div>
  );
}

'use client';

import { Alert, App, Button, Card, Empty, Form, Skeleton, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formToBody, registrationToForm, ServiceRegistrationForm } from '@/components/admissions/ServiceRegistrationForm';
import { api } from '@/lib/api';
import { REGISTRATION_STATUS } from '@/lib/labels';
import { useParent } from '@/lib/parent';

/** Start-of-year service registration for the selected child. */
export default function ParentServicesPage() {
  const { child, loading } = useParent();
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any>(child ? [`/parent/children/${child.id}/services`] : null);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      form.resetFields();
      form.setFieldsValue(registrationToForm(data.registration));
    }
  }, [data, form]);

  if (loading || (child && isLoading)) return <Skeleton active />;
  if (!child) return <Empty description="Chưa có học sinh nào gắn với tài khoản" />;

  const reg = data?.registration;
  const confirmed = reg?.status === 'CONFIRMED';

  async function save() {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await api(`/parent/children/${child!.id}/services`, { method: 'PUT', body: formToBody(values) });
      message.success(reg ? 'Đã cập nhật đăng ký' : 'Đã gửi đăng ký cho nhà trường');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        size="small"
        title={`Đăng ký dịch vụ năm học ${data?.academicYear?.name ?? ''}`}
        extra={reg ? <Tag color={REGISTRATION_STATUS[reg.status].color}>{REGISTRATION_STATUS[reg.status].label}</Tag> : <Tag>Chưa đăng ký</Tag>}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Học sinh: <strong>{child.fullName}</strong>
          {child.class ? ` · Lớp ${child.class.name}` : ''}
        </Typography.Paragraph>
        {confirmed && <Alert type="success" showIcon style={{ marginBottom: 12 }} message="Nhà trường đã xác nhận đăng ký" description="Để thay đổi, vui lòng liên hệ văn phòng nhà trường." />}
        <ServiceRegistrationForm form={form} disabled={confirmed} compact />
        {!confirmed && (
          <Button type="primary" block onClick={save} loading={busy}>
            {reg ? 'Cập nhật đăng ký' : 'Gửi đăng ký'}
          </Button>
        )}
      </Card>
    </div>
  );
}

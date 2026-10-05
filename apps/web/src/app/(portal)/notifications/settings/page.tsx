'use client';

import { App, Button, Card, Checkbox, Form, Input, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_CHANNEL, NOTIFICATION_KIND, ROLE, SYNC_STATUS } from '@/lib/labels';
import { formatTime } from '@/lib/time';

const OUTBOUND = ['PUSH', 'ZALO', 'SMS', 'EMAIL'];

/** Which channels the school sends on, plus the delivery outbox (mirrors the MISA sync page). */
export default function NotificationSettingsPage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const settings = useSWR<{ channels: string[] }>(['/notifications/settings']);
  const summary = useSWR<{ providers: Record<string, string>; rows: { channel: string; status: string; count: number }[] }>(['/notifications/deliveries/summary']);
  const [status, setStatus] = useState<string>();
  const [channel, setChannel] = useState<string>();
  const [page, setPage] = useState(1);
  const deliveries = useSWR<{ items: any[]; total: number }>(['/notifications/deliveries', { status, channel, page, pageSize: 20 }]);
  const [running, setRunning] = useState(false);

  async function saveChannels(channels: string[]) {
    try {
      await api('/notifications/settings', { method: 'PUT', body: { channels } });
      message.success('Đã lưu kênh gửi');
      await settings.mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function run() {
    setRunning(true);
    try {
      const r = await api<{ processed: number; sent: number; failed: number }>('/notifications/deliveries/run', { method: 'POST' });
      message.info(`Đã xử lý ${r.processed}: gửi ${r.sent}, lỗi ${r.failed}`);
      await Promise.all([summary.mutate(), deliveries.mutate()]);
    } finally {
      setRunning(false);
    }
  }

  async function sendTest(values: { title: string; body: string }) {
    try {
      await api('/notifications/test', { method: 'POST', body: values });
      message.success('Đã tạo thông báo thử cho chính bạn');
      await Promise.all([summary.mutate(), deliveries.mutate()]);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const count = (st: string) => summary.data?.rows.filter((r) => r.status === st).reduce((s, r) => s + r.count, 0) ?? 0;
  return (
    <>
      <PageHeader title="Kênh thông báo" />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card size="small" title="Kênh gửi cho phụ huynh và nhân viên">
          <Typography.Paragraph type="secondary">
            Thông báo luôn hiển thị trong ứng dụng. Chọn thêm các kênh gửi ra ngoài; mỗi kênh dùng một nhà cung cấp cấu hình trong biến môi trường
            NOTIFY_PROVIDERS (hiện tại: {summary.data ? Object.entries(summary.data.providers).map(([c, p]) => `${c}=${p}`).join(', ') : '…'}). Nhà cung cấp &quot;mock&quot; là môi trường thử
            nghiệm, không gửi tin thật.
          </Typography.Paragraph>
          <Checkbox.Group
            value={settings.data?.channels.filter((c) => c !== 'IN_APP')}
            onChange={(v) => saveChannels(v as string[])}
            options={OUTBOUND.map((c) => ({ value: c, label: NOTIFICATION_CHANNEL[c] }))}
          />
        </Card>

        <Card size="small" title="Hàng đợi gửi" extra={<Button onClick={run} loading={running}>Gửi ngay</Button>}>
          <Space size={24} wrap style={{ marginBottom: 12 }}>
            <Statistic title="Chờ gửi" value={count('PENDING')} />
            <Statistic title="Đã gửi" value={count('SUCCESS')} valueStyle={{ color: '#16a34a' }} />
            <Statistic title="Lỗi" value={count('FAILED')} valueStyle={{ color: '#dc2626' }} />
          </Space>
          <Space style={{ marginBottom: 12 }} wrap>
            <Select allowClear placeholder="Trạng thái" style={{ width: 160 }} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={Object.entries(SYNC_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
            <Select allowClear placeholder="Kênh" style={{ width: 180 }} value={channel} onChange={(v) => { setChannel(v); setPage(1); }} options={OUTBOUND.map((c) => ({ value: c, label: NOTIFICATION_CHANNEL[c] }))} />
          </Space>
          <Table<any>
            rowKey="id"
            size="small"
            loading={deliveries.isLoading}
            dataSource={deliveries.data?.items}
            pagination={{ current: page, pageSize: 20, total: deliveries.data?.total, onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: 'Thời gian', dataIndex: ['notification', 'createdAt'], render: (v: string) => `${new Date(v).toLocaleDateString('vi-VN', { timeZone: tz })} ${formatTime(v, tz)}` },
              { title: 'Kênh', dataIndex: 'channel', render: (v: string) => NOTIFICATION_CHANNEL[v] ?? v },
              { title: 'Người nhận', dataIndex: ['notification', 'user'], render: (u: any) => `${u.fullName} (${ROLE[u.role] ?? u.role})` },
              { title: 'Nội dung', dataIndex: ['notification', 'title'], render: (t: string, d: any) => <span><Tag>{NOTIFICATION_KIND[d.notification.kind] ?? d.notification.kind}</Tag>{t}</span> },
              { title: 'Trạng thái', dataIndex: 'status', render: (v: string, d: any) => <span><Tag color={SYNC_STATUS[v]?.color}>{SYNC_STATUS[v]?.label ?? v}</Tag>{d.attempts ? `${d.attempts} lần` : ''}</span> },
              { title: 'Lỗi / mã tham chiếu', render: (_, d: any) => d.lastError ?? d.externalRef ?? '' },
            ]}
          />
        </Card>

        <Card size="small" title="Gửi thử" style={{ maxWidth: 560 }}>
          <Form layout="vertical" onFinish={sendTest} initialValues={{ title: 'Thử kênh thông báo', body: 'Nếu bạn nhận được tin này thì kênh đã hoạt động.' }}>
            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="body" label="Nội dung" rules={[{ required: true }]} extra='Nội dung chứa "[mock-fail]" sẽ làm nhà cung cấp thử nghiệm báo lỗi, để kiểm tra việc thử lại.'>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button htmlType="submit">Gửi cho tôi</Button>
          </Form>
        </Card>
        <Typography.Text type="secondary">Loại thông báo: {Object.values(NOTIFICATION_KIND).join(' · ')}</Typography.Text>
      </Space>
    </>
  );
}

'use client';

import { Button, List, Select, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_KIND, options } from '@/lib/labels';
import { AppNotification, useNotificationStream } from '@/lib/notifications';
import { formatTime } from '@/lib/time';

/** The signed-in staff member's own notifications (leave decisions, announcements, system messages). */
export default function NotificationsPage() {
  const tz = useAuth().me!.school.timezone;
  const [kind, setKind] = useState<string>();
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<{ items: AppNotification[]; total: number }>(['/notifications', { kind, page, pageSize: 20 }]);
  const counter = useSWR<{ unread: number }>(['/notifications/unread-count']);
  useNotificationStream(() => {
    mutate();
    counter.mutate();
  });

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' });
    await Promise.all([mutate(), counter.mutate()]);
  }

  async function markRead(n: AppNotification) {
    if (n.readAt) return;
    await api(`/notifications/${n.id}/read`, { method: 'POST' });
    await Promise.all([mutate(), counter.mutate()]);
  }

  return (
    <>
      <PageHeader
        title="Thông báo của tôi"
        extra={
          <Space>
            <Select allowClear placeholder="Loại" style={{ width: 200 }} value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={options(NOTIFICATION_KIND)} />
            <Button onClick={markAll} disabled={!counter.data?.unread}>
              Đánh dấu tất cả đã đọc
            </Button>
          </Space>
        }
      />
      <List
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
        locale={{ emptyText: 'Chưa có thông báo' }}
        renderItem={(n) => (
          <List.Item onClick={() => markRead(n)} style={{ cursor: n.readAt ? 'default' : 'pointer', background: n.readAt ? undefined : '#eff6ff', padding: '10px 12px' }}>
            <List.Item.Meta
              title={
                <span style={{ fontWeight: n.readAt ? 400 : 600 }}>
                  {n.title} <Tag>{NOTIFICATION_KIND[n.kind] ?? n.kind}</Tag>
                </span>
              }
              description={
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(n.createdAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(n.createdAt, tz)}
                  </Typography.Text>
                </>
              }
            />
          </List.Item>
        )}
      />
    </>
  );
}

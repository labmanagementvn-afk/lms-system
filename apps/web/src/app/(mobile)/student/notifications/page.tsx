'use client';

import { App, Button, Empty, List, Segmented, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_KIND, RSVP } from '@/lib/labels';
import { AppNotification, useNotificationStream } from '@/lib/notifications';
import { formatTime } from '@/lib/time';

const PAGE = 20;

export default function StudentNotificationsPage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const [unread, setUnread] = useState(false);
  const [pages, setPages] = useState(1);
  const { data, isLoading, mutate } = useSWR<{ items: AppNotification[]; total: number }>(['/notifications', { pageSize: PAGE * pages, unread: unread || undefined }]);
  const counter = useSWR<{ unread: number }>(['/notifications/unread-count']);

  useNotificationStream(() => {
    mutate();
    counter.mutate();
  });

  async function markRead(n: AppNotification) {
    if (n.readAt) return;
    await api(`/notifications/${n.id}/read`, { method: 'POST' });
    await Promise.all([mutate(), counter.mutate()]);
  }

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' });
    await Promise.all([mutate(), counter.mutate()]);
  }

  async function rsvp(n: AppNotification, response: string) {
    try {
      await api(`/announcements/${n.announcementId}/rsvp`, { method: 'POST', body: { response } });
      message.success('Đã ghi nhận phản hồi');
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const items = data?.items ?? [];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Segmented
          value={unread ? 'unread' : 'all'}
          onChange={(v) => setUnread(v === 'unread')}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'unread', label: `Chưa đọc${counter.data?.unread ? ` (${counter.data.unread})` : ''}` },
          ]}
        />
        <Button size="small" type="link" onClick={markAll} disabled={!counter.data?.unread}>
          Đọc tất cả
        </Button>
      </div>
      <List
        loading={isLoading}
        dataSource={items}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo" /> }}
        renderItem={(n) => {
          const mine = n.announcement?.responses?.[0]?.response;
          return (
            <List.Item
              onClick={() => markRead(n)}
              style={{ cursor: n.readAt ? 'default' : 'pointer', background: n.readAt ? undefined : '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}
            >
              <List.Item.Meta
                title={
                  <span style={{ fontWeight: n.readAt ? 400 : 600 }}>
                    {n.title} <Tag style={{ marginLeft: 4 }}>{NOTIFICATION_KIND[n.kind] ?? n.kind}</Tag>
                  </span>
                }
                description={
                  <>
                    <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    {n.announcement?.eventAt && (
                      <div style={{ marginTop: 4 }}>
                        <Typography.Text>
                          🕒 {new Date(n.announcement.eventAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(n.announcement.eventAt, tz)}
                          {n.announcement.location ? ` · 📍 ${n.announcement.location}` : ''}
                        </Typography.Text>
                      </div>
                    )}
                    {n.announcement?.rsvp && (
                      <Space style={{ marginTop: 8 }} wrap onClick={(e) => e.stopPropagation()}>
                        {Object.entries(RSVP).map(([value, r]) => (
                          <Button key={value} size="small" type={mine === value ? 'primary' : 'default'} onClick={() => rsvp(n, value)}>
                            {r.label}
                          </Button>
                        ))}
                      </Space>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                      {new Date(n.createdAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(n.createdAt, tz)}
                      {n.student ? ` · ${n.student.fullName}` : ''}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
      {data && items.length < data.total && (
        <Button block onClick={() => setPages((p) => p + 1)}>
          Tải thêm
        </Button>
      )}
    </div>
  );
}

'use client';

import { App, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_KIND, RSVP } from '@/lib/labels';
import { formatTime } from '@/lib/time';

interface MineItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  eventAt: string | null;
  location: string | null;
  rsvp: boolean;
  sentAt: string | null;
  myResponse?: string | null;
  response?: string | null;
}

/** Announcements and events the school sent to this parent, with RSVP. */
export default function ParentEventsPage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { data, isLoading, mutate } = useSWR<MineItem[] | { items: MineItem[] }>(['/announcements/mine']);
  const items = Array.isArray(data) ? data : (data?.items ?? []);

  async function rsvp(id: string, response: string) {
    try {
      await api(`/announcements/${id}/rsvp`, { method: 'POST', body: { response } });
      message.success('Đã ghi nhận phản hồi');
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!items.length) return <Empty description="Chưa có thông báo hay sự kiện nào" style={{ marginTop: 48 }} />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((a) => {
        const mine = a.myResponse ?? a.response ?? null;
        return (
          <Card key={a.id} size="small">
            <Tag color={a.kind === 'EVENT' ? 'purple' : 'blue'}>{NOTIFICATION_KIND[a.kind] ?? a.kind}</Tag>
            <Typography.Title level={5} style={{ margin: '6px 0' }}>
              {a.title}
            </Typography.Title>
            {a.eventAt && (
              <Typography.Text>
                🕒 {new Date(a.eventAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(a.eventAt, tz)}
                {a.location ? ` · 📍 ${a.location}` : ''}
              </Typography.Text>
            )}
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{a.body}</Typography.Paragraph>
            {a.rsvp && (
              <Space wrap>
                {Object.entries(RSVP).map(([value, r]) => (
                  <Button key={value} size="small" type={mine === value ? 'primary' : 'default'} onClick={() => rsvp(a.id, value)}>
                    {r.label}
                  </Button>
                ))}
              </Space>
            )}
            {a.sentAt && (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Gửi {new Date(a.sentAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(a.sentAt, tz)}
              </Typography.Text>
            )}
          </Card>
        );
      })}
    </div>
  );
}

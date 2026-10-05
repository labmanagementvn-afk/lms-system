'use client';

import { VideoCameraOutlined } from '@ant-design/icons';
import { App, Button, Empty, List, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { countdown, formatDateTime } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LIVE_STATUS } from '@/lib/labels';

type Session = { id: string; title: string; startsAt: string; durationMin: number; status: string; joinUrl: string; canJoin: boolean; joined: boolean; course: { id: string; title: string } };

/** Live rooms of my courses from yesterday on; joining records attendance and opens Jitsi in a new tab. */
export default function StudentLivePage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { data, isLoading, mutate } = useSWR<Session[]>(['/student/live'], { refreshInterval: 60_000 });
  const [joining, setJoining] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Re-render each minute so the countdown text moves.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function join(s: Session) {
    setJoining(s.id);
    try {
      const r = await api(`/student/live/${s.id}/join`, { method: 'POST' });
      window.open(r.joinUrl, '_blank', 'noopener');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setJoining(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography.Title level={5} style={{ margin: '4px 0 0' }}>
        Lớp học trực tuyến
      </Typography.Title>
      <List
        loading={isLoading}
        dataSource={data}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có lớp học trực tuyến nào sắp tới" /> }}
        renderItem={(s) => {
          const st = LIVE_STATUS[s.status];
          return (
            <List.Item
              extra={
                (s.status === 'LIVE' || s.status === 'SCHEDULED') && (
                  <Button type={s.status === 'LIVE' ? 'primary' : 'default'} icon={<VideoCameraOutlined />} disabled={!s.canJoin} loading={joining === s.id} onClick={() => join(s)}>
                    Vào lớp
                  </Button>
                )
              }
            >
              <List.Item.Meta
                title={
                  <>
                    <Tag color={st?.color}>{st?.label ?? s.status}</Tag>
                    {s.title}
                  </>
                }
                description={
                  <>
                    <div>{s.course.title}</div>
                    <div>
                      {formatDateTime(s.startsAt, tz)} · {s.durationMin} phút
                      {s.status === 'SCHEDULED' && ` · ${countdown(s.startsAt)}`}
                      {s.status === 'SCHEDULED' && !s.canJoin && ' (mở cửa trước giờ học 15 phút)'}
                      {s.joined && ' · bạn đã tham gia'}
                    </div>
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
    </div>
  );
}

'use client';

import { BellOutlined } from '@ant-design/icons';
import { App, Badge, Button, Empty, List, Popover, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { NOTIFICATION_KIND } from '@/lib/labels';
import { AppNotification, useNotificationStream } from '@/lib/notifications';
import { formatTime } from '@/lib/time';

/** Unread badge with the latest notifications; live via the SSE stream. */
export function NotificationBell({ listHref, timeZone }: { listHref: string; timeZone: string }) {
  const { notification } = App.useApp();
  const [open, setOpen] = useState(false);
  const unread = useSWR<{ unread: number }>(['/notifications/unread-count']);
  const recent = useSWR<{ items: AppNotification[] }>(open ? ['/notifications', { pageSize: 8 }] : null);

  useNotificationStream((n) => {
    unread.mutate();
    recent.mutate();
    notification.info({ message: n.title, description: n.body, placement: 'topRight' });
  });

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' });
    await Promise.all([unread.mutate(), recent.mutate()]);
  }

  const content = (
    <div style={{ width: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>Thông báo</Typography.Text>
        <Button size="small" type="link" onClick={markAll} disabled={!unread.data?.unread}>
          Đánh dấu đã đọc
        </Button>
      </div>
      <List
        size="small"
        loading={recent.isLoading}
        dataSource={recent.data?.items ?? []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo" /> }}
        style={{ maxHeight: 360, overflow: 'auto' }}
        renderItem={(n) => (
          <List.Item style={{ opacity: n.readAt ? 0.65 : 1 }}>
            <List.Item.Meta
              title={
                <span>
                  {n.title} <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>· {NOTIFICATION_KIND[n.kind] ?? n.kind}</Typography.Text>
                </span>
              }
              description={
                <>
                  <div>{n.body}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(n.createdAt).toLocaleDateString('vi-VN', { timeZone })} {formatTime(n.createdAt, timeZone)}
                  </Typography.Text>
                </>
              }
            />
          </List.Item>
        )}
      />
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Link href={listHref} onClick={() => setOpen(false)}>
          Xem tất cả
        </Link>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight">
      <Badge count={unread.data?.unread ?? 0} size="small" offset={[-2, 2]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Thông báo" />
      </Badge>
    </Popover>
  );
}

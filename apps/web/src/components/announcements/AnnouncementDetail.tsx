'use client';

import { DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Col, Descriptions, DescriptionsProps, Divider, Drawer, List, Popconfirm, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { ANNOUNCEMENT_STATUS, NOTIFICATION_CHANNEL, NOTIFICATION_KIND, ROLE, RSVP } from '@/lib/labels';
import { describeAudience, describeRoles, formatDateTime } from './format';

/** Read-only view of one announcement with delivery, read and RSVP statistics. */
export function AnnouncementDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { message, modal } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { data: classes } = useClasses();
  const { data: a, isLoading, mutate } = useSWR<any>(id ? [`/announcements/${id}`] : null);
  const readPct = a?.recipients ? Math.round((a.readCount / a.recipients) * 100) : 0;

  async function send() {
    try {
      const p = await api(`/announcements/${id}/preview`, { method: 'POST' });
      modal.confirm({
        title: `Gửi "${a.title}" ngay?`,
        content: `Sẽ gửi tới ${p.recipients} người (${describeRoles(p.byRole)}).`,
        okText: 'Gửi',
        cancelText: 'Hủy',
        onOk: async () => {
          try {
            await api(`/announcements/${id}/send`, { method: 'POST' });
            message.success('Đã gửi thông báo');
            mutate();
            onChanged();
          } catch (e) {
            message.error((e as Error).message);
          }
        },
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove() {
    try {
      await api(`/announcements/${id}`, { method: 'DELETE' });
      message.success('Đã xóa thông báo');
      onChanged();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const items: DescriptionsProps['items'] = a
    ? [
        ...(a.kind === 'EVENT' ? [{ key: 'event', label: 'Diễn ra', children: `${formatDateTime(a.eventAt, tz)}${a.location ? ` · ${a.location}` : ''}` }] : []),
        { key: 'audience', label: 'Đối tượng', children: describeAudience(a.audience, classes) },
        { key: 'channels', label: 'Kênh gửi', children: a.channels.map((c: string) => NOTIFICATION_CHANNEL[c] ?? c).join(', ') },
        ...(a.scheduledAt && a.status !== 'SENT' ? [{ key: 'scheduled', label: 'Hẹn giờ gửi', children: formatDateTime(a.scheduledAt, tz) }] : []),
        ...(a.sentAt ? [{ key: 'sent', label: 'Đã gửi lúc', children: formatDateTime(a.sentAt, tz) }] : []),
        { key: 'created', label: 'Tạo lúc', children: formatDateTime(a.createdAt, tz) },
      ]
    : [];

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={680}
      destroyOnHidden
      loading={isLoading}
      title={a?.title ?? 'Thông báo'}
      extra={
        a &&
        a.status !== 'SENT' && (
          <Space>
            <Button type="primary" icon={<SendOutlined />} onClick={send}>
              Gửi ngay
            </Button>
            <Popconfirm title="Xóa thông báo này?" okText="Xóa" cancelText="Hủy" onConfirm={remove}>
              <Button danger icon={<DeleteOutlined />}>
                Xóa
              </Button>
            </Popconfirm>
          </Space>
        )
      }
    >
      {a && (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Tag color={a.kind === 'EVENT' ? 'purple' : 'blue'}>{NOTIFICATION_KIND[a.kind]}</Tag>
            <Tag color={ANNOUNCEMENT_STATUS[a.status].color}>{ANNOUNCEMENT_STATUS[a.status].label}</Tag>
            {a.rsvp && <Tag>Có xác nhận tham dự</Tag>}
          </Space>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{a.body}</Typography.Paragraph>
          <Descriptions size="small" column={1} bordered items={items} />
          {a.status === 'SENT' && (
            <>
              <Row gutter={12} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Statistic title="Người nhận" value={a.recipients} />
                </Col>
                <Col span={8}>
                  <Statistic title="Đã đọc" value={a.readCount} suffix={`/ ${a.recipients}`} />
                  <Progress size="small" percent={readPct} />
                </Col>
                {a.rsvp && (
                  <Col span={8}>
                    <Statistic title="Tham dự" value={a.rsvpCounts.GOING} valueStyle={{ color: '#16a34a' }} />
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Không: {a.rsvpCounts.NOT_GOING} · Chưa chắc: {a.rsvpCounts.MAYBE}
                    </div>
                  </Col>
                )}
              </Row>
              {a.rsvp && (
                <>
                  <Divider orientation="left" plain>
                    Phản hồi tham dự ({a.responses.length})
                  </Divider>
                  <List
                    size="small"
                    dataSource={a.responses as any[]}
                    locale={{ emptyText: 'Chưa có phản hồi' }}
                    renderItem={(r) => (
                      <List.Item>
                        <Space wrap>
                          <Tag color={RSVP[r.response].color} style={{ margin: 0 }}>
                            {RSVP[r.response].label}
                          </Tag>
                          <span>{r.user.fullName}</span>
                          <Typography.Text type="secondary">
                            {ROLE[r.user.role]} · {formatDateTime(r.respondedAt, tz)}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

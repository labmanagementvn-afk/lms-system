'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CoffeeOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FormOutlined,
  MedicineBoxOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { Alert, Card, Empty, List, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { DAY_STATUS, HOMEROOM_STATUS, NOTIFICATION_KIND, vnd } from '@/lib/labels';
import { AppNotification } from '@/lib/notifications';
import { useParent } from '@/lib/parent';
import { formatTime } from '@/lib/time';

const SHORTCUTS = [
  { href: '/parent/attendance', icon: <CalendarOutlined />, label: 'Điểm danh' },
  { href: '/parent/invoices', icon: <DollarOutlined />, label: 'Học phí' },
  { href: '/parent/meals', icon: <CoffeeOutlined />, label: 'Bán trú' },
  { href: '/parent/health', icon: <MedicineBoxOutlined />, label: 'Sức khỏe' },
  { href: '/parent/bus', icon: <CarOutlined />, label: 'Xe tuyến' },
  { href: '/parent/events', icon: <NotificationOutlined />, label: 'Sự kiện' },
  { href: '/parent/services', icon: <FormOutlined />, label: 'Dịch vụ' },
  { href: '/parent/leave', icon: <FileDoneOutlined />, label: 'Xin nghỉ học' },
];

export default function ParentHome() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { child, loading } = useParent();
  const invoices = useSWR<{ outstanding: number }>(child ? [`/parent/children/${child.id}/invoices`] : null);
  const recent = useSWR<{ items: AppNotification[] }>(['/notifications', { pageSize: 5 }]);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) {
    return (
      <Empty description="Tài khoản chưa được gắn với học sinh nào. Vui lòng liên hệ nhà trường." style={{ marginTop: 48 }} />
    );
  }

  const t = child.today;
  const gate = t.status ? DAY_STATUS[t.status] : null;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small">
        <Typography.Text type="secondary">Hôm nay, {t.date.split('-').reverse().join('/')}</Typography.Text>
        <Typography.Title level={4} style={{ margin: '4px 0' }}>
          {child.fullName}
        </Typography.Title>
        <Typography.Text type="secondary">
          {child.class ? `Lớp ${child.class.name}` : 'Chưa xếp lớp'} · Mã HS {child.code}
        </Typography.Text>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {gate ? <Tag color={gate.color}>Cổng: {gate.label}</Tag> : <Tag>Cổng: chưa có dữ liệu</Tag>}
          {t.homeroom && <Tag color={HOMEROOM_STATUS[t.homeroom.status]?.color}>Lớp: {HOMEROOM_STATUS[t.homeroom.status]?.label}</Tag>}
        </div>
        {(t.firstIn || t.lastOut) && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {t.firstIn ? `Vào cổng ${formatTime(t.firstIn, tz)}` : ''}
            {t.firstIn && t.lastOut ? ' · ' : ''}
            {t.lastOut ? `Ra cổng ${formatTime(t.lastOut, tz)}` : ''}
          </Typography.Text>
        )}
      </Card>

      {!!invoices.data?.outstanding && (
        <Link href="/parent/invoices">
          <Alert type="warning" showIcon message={`Còn phải nộp ${vnd(invoices.data.outstanding)}`} description="Chạm để xem và thanh toán bằng QR" />
        </Link>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} style={{ textAlign: 'center', color: '#1f2937' }}>
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '12px 0', fontSize: 22, color: '#1d4ed8' }}>{s.icon}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <Card size="small" title="Thông báo mới" extra={<Link href="/parent/notifications">Tất cả</Link>}>
        <List
          size="small"
          loading={recent.isLoading}
          dataSource={recent.data?.items ?? []}
          locale={{ emptyText: 'Chưa có thông báo' }}
          renderItem={(n) => (
            <List.Item style={{ padding: '8px 0' }}>
              <List.Item.Meta
                title={<span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</span>}
                description={
                  <>
                    <div>{n.body}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {NOTIFICATION_KIND[n.kind] ?? n.kind} · {new Date(n.createdAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(n.createdAt, tz)}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

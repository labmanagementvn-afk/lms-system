'use client';

import { CalendarOutlined, CoffeeOutlined, FormOutlined, LogoutOutlined, MedicineBoxOutlined, NotificationOutlined, RightOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, List, Typography } from 'antd';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useParent } from '@/lib/parent';

const ITEMS = [
  { href: '/parent/attendance', icon: <CalendarOutlined />, label: 'Điểm danh & chuyên cần' },
  { href: '/parent/health', icon: <MedicineBoxOutlined />, label: 'Sổ sức khỏe' },
  { href: '/parent/meals', icon: <CoffeeOutlined />, label: 'Đăng ký bán trú' },
  { href: '/parent/services', icon: <FormOutlined />, label: 'Đăng ký dịch vụ năm học' },
  { href: '/parent/events', icon: <NotificationOutlined />, label: 'Thông báo & sự kiện của trường' },
  { href: '/parent/account', icon: <UserOutlined />, label: 'Tài khoản & mật khẩu' },
];

export default function ParentMorePage() {
  const { me, logout } = useAuth();
  const { children } = useParent();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small">
        <Typography.Text strong>{me!.fullName}</Typography.Text>
        <div>
          <Typography.Text type="secondary">{me!.phone}</Typography.Text>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Phụ huynh của: {children.map((c) => c.fullName).join(', ') || '—'}
        </Typography.Text>
      </Card>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <List
          dataSource={ITEMS}
          renderItem={(i) => (
            <Link href={i.href}>
              <List.Item style={{ padding: '12px 16px' }} extra={<RightOutlined style={{ color: '#9ca3af' }} />}>
                <span style={{ color: '#1d4ed8', fontSize: 18, marginRight: 12 }}>{i.icon}</span>
                <span style={{ color: '#1f2937' }}>{i.label}</span>
              </List.Item>
            </Link>
          )}
        />
      </Card>
      <Button danger block icon={<LogoutOutlined />} onClick={logout}>
        Đăng xuất
      </Button>
    </div>
  );
}

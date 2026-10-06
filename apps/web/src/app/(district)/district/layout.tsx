'use client';

import { AuditOutlined, BankOutlined, DashboardOutlined, LogoutOutlined, TeamOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Spin, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { homeFor, useAuth } from '@/lib/auth';
import { DISTRICT_LEVEL } from '@/lib/labels';

const { Sider, Header, Content } = Layout;

/** The Phòng/Sở GD&ĐT portal: cross-school dashboards for district officers. */
export default function DistrictLayout({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'DISTRICT') router.replace(homeFor(me.role));
    else if (me.mustChangePassword && pathname !== '/district/account') router.replace('/district/account');
  }, [loading, me, pathname, router]);

  if (loading || !me || me.role !== 'DISTRICT') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const items = [
    { key: '/district', icon: <DashboardOutlined />, label: <Link href="/district">Tổng quan</Link> },
    { key: '/district/schools', icon: <BankOutlined />, label: <Link href="/district/schools">Trường học</Link> },
    { key: '/district/alerts', icon: <WarningOutlined />, label: <Link href="/district/alerts">Cảnh báo</Link> },
    { key: '/district/audit', icon: <AuditOutlined />, label: <Link href="/district/audit">Nhật ký hệ thống</Link> },
    { key: '/district/users', icon: <TeamOutlined />, label: <Link href="/district/users">Tài khoản chuyên viên</Link> },
  ];
  const selected = items
    .map((i) => i.key)
    .filter((k) => (k === '/district' ? pathname === '/district' : pathname.startsWith(k)))
    .sort((a, b) => b.length - a.length)
    .slice(0, 1);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={232}>
        <div style={{ padding: 16, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <div style={{ fontWeight: 600 }}>{collapsed ? 'PGD' : me.district?.name}</div>
          {!collapsed && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {DISTRICT_LEVEL[me.district?.level ?? ''] ?? ''}
              {me.district?.province ? ` · ${me.district.province}` : ''}
            </Typography.Text>
          )}
        </div>
        <Menu mode="inline" selectedKeys={selected} items={items} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <NotificationBell listHref="/district/notifications" timeZone={me.school.timezone} />
          <Dropdown
            menu={{
              items: [
                { key: 'account', icon: <UserOutlined />, label: <Link href="/district/account">Tài khoản</Link> },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text">
              <Space>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{me.fullName}</span>
                <Typography.Text type="secondary">(Chuyên viên)</Typography.Text>
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 16 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

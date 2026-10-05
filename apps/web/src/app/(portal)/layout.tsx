'use client';

import {
  ApartmentOutlined,
  CalendarOutlined,
  DashboardOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  ScanOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Spin, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLE } from '@/lib/labels';

const { Sider, Header, Content } = Layout;

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (loading || !me) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const items = [
    { key: '/', icon: <DashboardOutlined />, label: <Link href="/">Tổng quan</Link> },
    { key: '/teachers', icon: <IdcardOutlined />, label: <Link href="/teachers">Giáo viên</Link> },
    { key: '/students', icon: <UserOutlined />, label: <Link href="/students">Học sinh</Link> },
    { key: '/classes', icon: <ApartmentOutlined />, label: <Link href="/classes">Lớp học</Link> },
    { key: '/schedules', icon: <CalendarOutlined />, label: <Link href="/schedules">Thời khóa biểu</Link> },
    {
      key: 'attendance',
      icon: <LoginOutlined />,
      label: 'Điểm danh ra vào',
      children: [
        { key: '/attendance', icon: <TeamOutlined />, label: <Link href="/attendance">Báo cáo theo ngày</Link> },
        ...(me.role !== 'TEACHER'
          ? [{ key: '/attendance/devices', icon: <ScanOutlined />, label: <Link href="/attendance/devices">Thiết bị & định danh</Link> }]
          : []),
      ],
    },
    ...(me.role === 'ADMIN' ? [{ key: '/settings', icon: <SettingOutlined />, label: <Link href="/settings">Thiết lập</Link> }] : []),
  ];

  const selected = items
    .flatMap((i) => ('children' in i && i.children ? i.children : [i]))
    .map((i) => i.key)
    .filter((k) => (k === '/' ? pathname === '/' : pathname.startsWith(k)))
    .sort((a, b) => b.length - a.length)
    .slice(0, 1);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={232}>
        <div style={{ padding: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {collapsed ? 'QLTH' : me.school.name}
        </div>
        <Menu mode="inline" selectedKeys={selected} defaultOpenKeys={['attendance']} items={items} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown
            menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout }] }}
            trigger={['click']}
          >
            <Button type="text">
              <Space>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{me.fullName}</span>
                <Typography.Text type="secondary">({ROLE[me.role]})</Typography.Text>
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 16 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

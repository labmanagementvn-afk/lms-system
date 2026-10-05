'use client';

import {
  ApartmentOutlined,
  BookOutlined,
  CoffeeOutlined,
  DollarOutlined,
  MedicineBoxOutlined,
  ShopOutlined,
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
    ...(me.role !== 'TEACHER'
      ? [
          {
            key: 'finance',
            icon: <DollarOutlined />,
            label: 'Học phí',
            children: [
              { key: '/finance/invoices', label: <Link href="/finance/invoices">Công nợ & thu tiền</Link> },
              { key: '/finance/campaigns', label: <Link href="/finance/campaigns">Đợt thu</Link> },
              { key: '/finance/fee-items', label: <Link href="/finance/fee-items">Khoản thu & miễn giảm</Link> },
              { key: '/finance/reconciliation', label: <Link href="/finance/reconciliation">Đối soát ngân hàng</Link> },
              { key: '/finance/accounting', label: <Link href="/finance/accounting">Đồng bộ MISA</Link> },
              { key: '/finance/settings', label: <Link href="/finance/settings">Tài khoản nhận tiền</Link> },
            ],
          },
          {
            key: 'store',
            icon: <ShopOutlined />,
            label: 'Cấp phát',
            children: [
              { key: '/store/items', label: <Link href="/store/items">Hàng hóa & tồn kho</Link> },
              { key: '/store/orders', label: <Link href="/store/orders">Phiếu cấp phát</Link> },
            ],
          },
        ]
      : []),
    { key: '/canteen', icon: <CoffeeOutlined />, label: <Link href="/canteen">Bán trú</Link> },
    {
      key: 'library',
      icon: <BookOutlined />,
      label: 'Thư viện',
      children: [
        { key: '/library/books', label: <Link href="/library/books">Đầu sách</Link> },
        { key: '/library/circulation', label: <Link href="/library/circulation">Mượn trả</Link> },
      ],
    },
    ...(me.role !== 'TEACHER' ? [{ key: '/health', icon: <MedicineBoxOutlined />, label: <Link href="/health">Y tế học đường</Link> }] : []),
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

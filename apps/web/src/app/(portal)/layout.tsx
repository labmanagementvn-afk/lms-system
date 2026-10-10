'use client';

import {
  ApartmentOutlined,
  BookOutlined,
  CarOutlined,
  ReadOutlined,
  StarOutlined,
  ProfileOutlined,
  CoffeeOutlined,
  DollarOutlined,
  FileTextOutlined,
  FormOutlined,
  LaptopOutlined,
  MedicineBoxOutlined,
  NotificationOutlined,
  ShopOutlined,
  CalendarOutlined,
  DashboardOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  ScanOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Spin, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { homeFor, isPortalRole, useAuth } from '@/lib/auth';
import { ROLE } from '@/lib/labels';

const { Sider, Header, Content } = Layout;

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
    // Parents and drivers have their own apps.
    if (me && !isPortalRole(me.role)) router.replace(homeFor(me.role));
  }, [loading, me, router]);

  if (loading || !me || !isPortalRole(me.role)) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const staff = me.role !== 'TEACHER';
  const items = [
    { key: '/', icon: <DashboardOutlined />, label: <Link href="/">Tổng quan</Link> },
    { key: '/teachers', icon: <IdcardOutlined />, label: <Link href="/teachers">Giáo viên</Link> },
    { key: '/students', icon: <UserOutlined />, label: <Link href="/students">Học sinh</Link> },
    ...(staff
      ? [
          { key: '/parents', icon: <UsergroupAddOutlined />, label: <Link href="/parents">Tài khoản phụ huynh</Link> },
          { key: '/students/accounts', icon: <IdcardOutlined />, label: <Link href="/students/accounts">Tài khoản học sinh</Link> },
        ]
      : []),
    { key: '/classes', icon: <ApartmentOutlined />, label: <Link href="/classes">Lớp học</Link> },
    { key: '/schedules', icon: <CalendarOutlined />, label: <Link href="/schedules">Thời khóa biểu</Link> },
    {
      key: 'attendance',
      icon: <LoginOutlined />,
      label: 'Điểm danh',
      children: [
        { key: '/attendance/homeroom', label: <Link href="/attendance/homeroom">Điểm danh lớp</Link> },
        { key: '/attendance/logbook', label: <Link href="/attendance/logbook">Sổ đầu bài</Link> },
        { key: '/attendance', icon: <TeamOutlined />, label: <Link href="/attendance">Ra vào cổng</Link> },
        ...(staff ? [{ key: '/attendance/devices', icon: <ScanOutlined />, label: <Link href="/attendance/devices">Thiết bị & định danh</Link> }] : []),
      ],
    },
    {
      key: 'grades',
      icon: <ProfileOutlined />,
      label: 'Sổ điểm',
      children: [
        { key: '/grades', label: <Link href="/grades">Nhập điểm</Link> },
        { key: '/grades/results', label: <Link href="/grades/results">Kết quả học tập</Link> },
        { key: '/grades/review', label: <Link href="/grades/review">Kiểm tra lại & rèn luyện hè</Link> },
        { key: '/grades/completion', label: <Link href="/grades/completion">Xét hoàn thành THCS</Link> },
        { key: '/grades/control', label: <Link href="/grades/control">Quản lý sổ điểm</Link> },
        ...(staff ? [{ key: '/grades/settings', label: <Link href="/grades/settings">Môn học & cách đánh giá</Link> }] : []),
      ],
    },
    { key: '/reports', icon: <FileTextOutlined />, label: <Link href="/reports">Báo cáo</Link> },
    { key: '/conduct', icon: <StarOutlined />, label: <Link href="/conduct">Rèn luyện</Link> },
    {
      key: 'lms',
      icon: <ReadOutlined />,
      label: 'E-learning',
      children: [
        { key: '/lms/courses', label: <Link href="/lms/courses">Khóa học</Link> },
        { key: '/lms/questions', label: <Link href="/lms/questions">Ngân hàng câu hỏi</Link> },
        { key: '/lms/tests', label: <Link href="/lms/tests">Bài kiểm tra & cuộc thi</Link> },
        { key: '/lms/live', label: <Link href="/lms/live">Lớp học trực tuyến</Link> },
        { key: '/lms/reports', label: <Link href="/lms/reports">Báo cáo học tập</Link> },
      ],
    },
    { key: '/announcements', icon: <NotificationOutlined />, label: <Link href="/announcements">Thông báo & sự kiện</Link> },
    ...(staff
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
    ...(staff
      ? [
          { key: '/health', icon: <MedicineBoxOutlined />, label: <Link href="/health">Y tế học đường</Link> },
          {
            key: 'bus',
            icon: <CarOutlined />,
            label: 'Xe đưa đón',
            children: [
              { key: '/bus/live', label: <Link href="/bus/live">Bản đồ trực tiếp</Link> },
              { key: '/bus/routes', label: <Link href="/bus/routes">Tuyến & điểm đón</Link> },
              { key: '/bus/fleet', label: <Link href="/bus/fleet">Xe & lái xe</Link> },
            ],
          },
          {
            key: 'admissions',
            icon: <FormOutlined />,
            label: 'Tuyển sinh',
            children: [
              { key: '/admissions', label: <Link href="/admissions">Hồ sơ tuyển sinh</Link> },
              { key: '/admissions/services', label: <Link href="/admissions/services">Đăng ký dịch vụ</Link> },
            ],
          },
          { key: '/hr', icon: <SolutionOutlined />, label: <Link href="/hr">Nhân sự</Link> },
          { key: '/assets', icon: <LaptopOutlined />, label: <Link href="/assets">Tài sản</Link> },
        ]
      : []),
    ...(me.role === 'ADMIN'
      ? [
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Thiết lập',
            children: [
              { key: '/settings', label: <Link href="/settings">Trường & năm học</Link> },
              { key: '/notifications/settings', label: <Link href="/notifications/settings">Kênh thông báo</Link> },
              { key: '/settings/alerts', label: <Link href="/settings/alerts">Cảnh báo</Link> },
              { key: '/settings/moet', label: <Link href="/settings/moet">Dữ liệu CSDL ngành</Link> },
              { key: '/settings/audit', label: <Link href="/settings/audit">Nhật ký hệ thống</Link> },
            ],
          },
        ]
      : []),
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
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <NotificationBell listHref="/notifications" timeZone={me.school.timezone} />
          <Dropdown
            menu={{
              items: [
                { key: 'account', icon: <UserOutlined />, label: <Link href="/account">Tài khoản</Link> },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
              ],
            }}
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

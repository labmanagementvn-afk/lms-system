'use client';

import { BellOutlined, CarOutlined, DollarOutlined, HomeOutlined, MenuOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { MobileShell } from '@/components/MobileShell';
import { homeFor, useAuth } from '@/lib/auth';
import { ChildSwitcher, ParentProvider } from '@/lib/parent';

const TABS = [
  { href: '/parent', icon: <HomeOutlined />, label: 'Trang chủ' },
  { href: '/parent/notifications', icon: <BellOutlined />, label: 'Thông báo' },
  { href: '/parent/invoices', icon: <DollarOutlined />, label: 'Học phí' },
  { href: '/parent/bus', icon: <CarOutlined />, label: 'Xe tuyến' },
  { href: '/parent/more', icon: <MenuOutlined />, label: 'Thêm' },
];

/** The parent app: phone-sized, one child selected at a time. */
export default function ParentLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'PARENT') router.replace(homeFor(me.role));
    else if (me.mustChangePassword && pathname !== '/parent/account') router.replace('/parent/account');
  }, [loading, me, pathname, router]);

  if (loading || !me || me.role !== 'PARENT') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ParentProvider>
      <MobileShell title={me.school.name} extra={<ChildSwitcher />} tabs={TABS}>
        {children}
      </MobileShell>
    </ParentProvider>
  );
}

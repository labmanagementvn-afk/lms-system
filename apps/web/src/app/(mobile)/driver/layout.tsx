'use client';

import { CarOutlined, UserOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { MobileShell } from '@/components/MobileShell';
import { homeFor, useAuth } from '@/lib/auth';

const TABS = [
  { href: '/driver', icon: <CarOutlined />, label: 'Chuyến xe' },
  { href: '/driver/account', icon: <UserOutlined />, label: 'Tài khoản' },
];

/** The driver / bus monitor app: today's trips, boarding and live location. */
export default function DriverLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'DRIVER') router.replace(homeFor(me.role));
    else if (me.mustChangePassword && pathname !== '/driver/account') router.replace('/driver/account');
  }, [loading, me, pathname, router]);

  if (loading || !me || me.role !== 'DRIVER') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <MobileShell title={me.school.name} tabs={TABS}>
      {children}
    </MobileShell>
  );
}

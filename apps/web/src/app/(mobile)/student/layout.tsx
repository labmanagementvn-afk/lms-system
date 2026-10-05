'use client';

import { FormOutlined, MenuOutlined, ProfileOutlined, ReadOutlined, StarOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { MobileShell } from '@/components/MobileShell';
import { homeFor, useAuth } from '@/lib/auth';

const TABS = [
  { href: '/student', icon: <ReadOutlined />, label: 'Khóa học' },
  { href: '/student/tests', icon: <FormOutlined />, label: 'Kiểm tra' },
  { href: '/student/grades', icon: <ProfileOutlined />, label: 'Điểm số' },
  { href: '/student/conduct', icon: <StarOutlined />, label: 'Rèn luyện' },
  { href: '/student/more', icon: <MenuOutlined />, label: 'Thêm' },
];

/** The student app: courses, tests, marks and conduct. Wider than the parent app so lessons read well on a laptop. */
export default function StudentLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'STUDENT') router.replace(homeFor(me.role));
    else if (me.mustChangePassword && pathname !== '/student/account') router.replace('/student/account');
  }, [loading, me, pathname, router]);

  if (loading || !me || me.role !== 'STUDENT') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <MobileShell title={me.school.name} extra={<span style={{ fontSize: 13, opacity: 0.9 }}>{me.fullName}</span>} tabs={TABS} maxWidth={960}>
      {children}
    </MobileShell>
  );
}

'use client';

import { Result, Tabs } from 'antd';
import { useState } from 'react';
import { ApplicationsTab } from '@/components/admissions/ApplicationsTab';
import { RoundsTab } from '@/components/admissions/RoundsTab';
import { PageHeader } from '@/components/PageHeader';
import { canEditStudents, useAuth } from '@/lib/auth';

export default function AdmissionsPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState('applications');

  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Hồ sơ tuyển sinh chỉ dành cho văn phòng nhà trường." />;
  }

  return (
    <>
      <PageHeader title="Tuyển sinh" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'applications', label: 'Hồ sơ', children: <ApplicationsTab /> },
          { key: 'rounds', label: 'Đợt tuyển sinh', children: <RoundsTab /> },
        ]}
      />
    </>
  );
}

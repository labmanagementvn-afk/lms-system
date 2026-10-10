'use client';

import { Tabs } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CatalogueTab } from '@/components/teaching/CatalogueTab';
import { DutiesTab } from '@/components/teaching/DutiesTab';
import { WorkloadTab } from '@/components/teaching/WorkloadTab';
import { canManage, useAuth } from '@/lib/auth';

/** Chức vụ, kiêm nhiệm and định mức tiết dạy under Thông tư 05/2025/TT-BGDĐT. */
export default function DutiesPage() {
  const { me } = useAuth();
  const admin = canManage(me);
  const [tab, setTab] = useState('workload');
  return (
    <>
      <PageHeader title="Kiêm nhiệm và định mức tiết dạy" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'workload', label: 'Định mức tiết dạy', children: <WorkloadTab /> },
          { key: 'duties', label: 'Chức vụ, kiêm nhiệm', children: <DutiesTab admin={admin} /> },
          { key: 'catalogue', label: 'Danh mục và định mức', children: <CatalogueTab admin={admin} /> },
        ]}
      />
    </>
  );
}

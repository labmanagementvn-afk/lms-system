'use client';

import { AccountPanel } from '@/components/AccountPanel';
import { PageHeader } from '@/components/PageHeader';

export default function DistrictAccountPage() {
  return (
    <>
      <PageHeader title="Tài khoản" />
      <div style={{ maxWidth: 480 }}>
        <AccountPanel />
      </div>
    </>
  );
}

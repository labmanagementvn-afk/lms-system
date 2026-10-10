'use client';

import { AccountPanel } from '@/components/AccountPanel';
import { SignatureCard } from '@/components/esign/SignatureCard';
import { PageHeader } from '@/components/PageHeader';

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Tài khoản" />
      {/* Side by side on wide screens, one column on a phone. */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 480px))', alignItems: 'start' }}>
        <AccountPanel />
        <SignatureCard />
      </div>
    </>
  );
}

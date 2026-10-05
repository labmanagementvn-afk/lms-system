'use client';

import { useRouter } from 'next/navigation';
import { AccountPanel } from '@/components/AccountPanel';

export default function DriverAccountPage() {
  const router = useRouter();
  return <AccountPanel onPasswordChanged={() => router.replace('/driver')} />;
}

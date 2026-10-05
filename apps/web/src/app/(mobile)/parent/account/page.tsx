'use client';

import { useRouter } from 'next/navigation';
import { AccountPanel } from '@/components/AccountPanel';

export default function ParentAccountPage() {
  const router = useRouter();
  return <AccountPanel onPasswordChanged={() => router.replace('/parent')} />;
}

'use client';

import { useRouter } from 'next/navigation';
import { AccountPanel } from '@/components/AccountPanel';

export default function StudentAccountPage() {
  const router = useRouter();
  return <AccountPanel onPasswordChanged={() => router.replace('/student')} />;
}

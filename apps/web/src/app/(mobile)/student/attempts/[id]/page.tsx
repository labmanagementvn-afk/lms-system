'use client';

import { Alert, Spin } from 'antd';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { AttemptResult, AttemptResultData } from '@/components/assessments/AttemptResult';
import { AttemptPayload, TestRunner } from '@/components/assessments/TestRunner';

const spinner = <Spin style={{ display: 'block', margin: '48px auto' }} />;

/** Takes an attempt that is in progress, or shows the result of one already handed in. */
export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  const { mutate } = useSWRConfig();
  // Loaded once: refetching while the student works would reset what they typed.
  const { data, error, isLoading } = useSWR<AttemptPayload>([`/student/attempts/${id}`], { revalidateIfStale: false, revalidateOnReconnect: false });
  // Keyed by attempt id: "Làm lại" moves to a new id while this page instance may stay mounted.
  const [done, setDone] = useState<{ id: string; result: AttemptResultData } | null>(null);
  const submitted = done?.id === id ? done.result : null;
  const finished = !!data && data.attempt.status !== 'IN_PROGRESS';
  const result = useSWR<AttemptResultData>(finished && !submitted ? [`/student/attempts/${id}/result`] : null);

  if (submitted) return <AttemptResult result={submitted} />;
  if (isLoading) return spinner;
  if (error || !data) return <Alert type="error" showIcon message={error?.message ?? 'Không tìm thấy bài làm'} />;
  if (finished) {
    if (result.error) return <Alert type="error" showIcon message={result.error.message} />;
    return result.data ? <AttemptResult result={result.data} /> : spinner;
  }
  return (
    <TestRunner
      key={data.attempt.id}
      payload={data}
      onSubmitted={(r) => {
        setDone({ id, result: r });
        // Lists, the test page and this attempt now show the handed-in state.
        mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/student/') && key[0] !== `/student/attempts/${id}`);
        mutate([`/student/attempts/${id}`], { ...data, attempt: { ...data.attempt, status: r.status } }, false);
      }}
    />
  );
}

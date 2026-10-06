'use client';

import { CheckCircleOutlined, ClockCircleOutlined, FieldTimeOutlined, RightOutlined } from '@ant-design/icons';
import { App, Card, Space, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { countdown, formatDateTime } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TEST_KIND } from '@/lib/labels';
import { KIND_COLOR, score, StudentTest } from './model';

/** Where a test stands for the signed-in student, as a coloured tag. */
export function testState(t: StudentTest, now = Date.now()): { label: string; color: string } {
  if (t.inProgressAttemptId) return { label: 'Đang làm dở', color: 'blue' };
  if (t.canStart) return t.myAttempts.length ? { label: 'Có thể làm lại', color: 'cyan' } : { label: 'Chưa làm', color: 'orange' };
  if (t.status === 'CLOSED' || (t.closeAt && new Date(t.closeAt).getTime() < now)) return { label: 'Đã đóng', color: 'default' };
  if (t.openAt && new Date(t.openAt).getTime() > now) return { label: 'Chưa mở', color: 'default' };
  if (t.myAttempts.length) return { label: 'Đã làm', color: 'green' };
  return { label: t.reason ?? 'Không làm được', color: 'default' };
}

/** Starts (or resumes) an attempt and opens the test runner. */
export function useStartAttempt() {
  const { message } = App.useApp();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [starting, setStarting] = useState<string | null>(null);
  async function start(testId: string) {
    setStarting(testId);
    try {
      const r = await api(`/student/tests/${testId}/attempts`, { method: 'POST' });
      mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/student/'));
      router.push(`/student/attempts/${r.attempt.id}`);
    } catch (e) {
      message.error((e as Error).message);
      setStarting(null);
    }
  }
  return { start, starting };
}

/** One assigned test in the student list; the whole card opens the test page. */
export function StudentTestCard({ test }: { test: StudentTest }) {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const state = testState(test);
  const best = test.myBest;
  const passed = best && !best.needsGrading && best.percent >= (test.passPercent ?? 50);
  return (
    <Link href={`/student/tests/${test.id}`} style={{ display: 'block', color: 'inherit' }}>
      <Card size="small" hoverable styles={{ body: { padding: 12 } }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={4} wrap style={{ marginBottom: 4 }}>
              <Tag color={KIND_COLOR[test.kind]}>{TEST_KIND[test.kind]}</Tag>
              <Tag color={state.color}>{state.label}</Tag>
            </Space>
            <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
              {test.title}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {[test.subject?.name, `${test.questionCount} câu`, test.timeLimitMin ? `${test.timeLimitMin} phút` : 'không giới hạn thời gian', `${score(test.maxScore)} điểm`].filter(Boolean).join(' · ')}
            </Typography.Text>
            <div style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {test.closeAt && (
                <span style={{ color: new Date(test.closeAt).getTime() - Date.now() < 86_400_000 && test.canStart ? '#dc2626' : '#4b5563' }}>
                  <FieldTimeOutlined /> Hạn {formatDateTime(test.closeAt, tz)} ({countdown(test.closeAt)})
                </span>
              )}
              {test.openAt && new Date(test.openAt).getTime() > Date.now() && (
                <span>
                  <ClockCircleOutlined /> Mở lúc {formatDateTime(test.openAt, tz)}
                </span>
              )}
              <span>
                Lượt làm: {test.myAttempts.filter((a) => a.status !== 'IN_PROGRESS').length}/{test.maxAttempts}
              </span>
              {best && (
                <span style={{ color: best.needsGrading ? '#d97706' : passed ? '#16a34a' : '#dc2626' }}>
                  <CheckCircleOutlined /> Điểm cao nhất {score(best.score)}/{score(best.maxScore)}
                  {best.needsGrading ? ' (chờ chấm tự luận)' : ` (${best.percent}%)`}
                </span>
              )}
            </div>
          </div>
          <RightOutlined style={{ color: '#9ca3af', marginTop: 6 }} />
        </div>
      </Card>
    </Link>
  );
}

'use client';

import { FieldTimeOutlined, PlayCircleOutlined, TeamOutlined, TrophyOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { LeaderboardTable } from '@/components/assessments/LeaderboardTable';
import { LeaderboardRow, score, StudentTest } from '@/components/assessments/model';
import { testState } from '@/components/assessments/student';
import { countdown, formatDateTime } from '@/components/lms/format';
import { useAuth } from '@/lib/auth';
import { useStudent } from '@/lib/student';

type Contest = StudentTest & { participants: number; myRank: number | null; top: LeaderboardRow[] };

/** School-wide and class contests with my result, my rank and the top 10. */
export default function StudentContestsPage() {
  const { me } = useAuth();
  const { student } = useStudent();
  const router = useRouter();
  const tz = me!.school.timezone;
  const { data, isLoading } = useSWR<Contest[]>(['/student/contests']);

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!data?.length) return <Empty style={{ marginTop: 48 }} description="Chưa có cuộc thi nào dành cho em" />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography.Title level={5} style={{ margin: '4px 0 0' }}>
        <TrophyOutlined style={{ color: '#d97706' }} /> Cuộc thi
      </Typography.Title>
      {data.map((c) => {
        const state = testState(c);
        return (
          <Card
            key={c.id}
            size="small"
            title={
              <Link href={`/student/tests/${c.id}`} style={{ color: 'inherit' }}>
                {c.title}
              </Link>
            }
            extra={<Tag color={state.color}>{state.label}</Tag>}
          >
            {c.description && <Typography.Paragraph type="secondary">{c.description}</Typography.Paragraph>}
            <Space wrap size={[16, 4]} style={{ fontSize: 13, marginBottom: 12 }}>
              <span>
                {c.questionCount} câu · {score(c.maxScore)} điểm · {c.timeLimitMin ? `${c.timeLimitMin} phút` : 'không giới hạn thời gian'}
              </span>
              {c.closeAt && (
                <span>
                  <FieldTimeOutlined /> Kết thúc {formatDateTime(c.closeAt, tz)} ({countdown(c.closeAt)})
                </span>
              )}
              <span>
                <TeamOutlined /> {c.participants} học sinh đã tham gia
              </span>
            </Space>
            {c.myBest && (
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                Kết quả của em: <b>{score(c.myBest.score)}/{score(c.myBest.maxScore)}</b> điểm
                {c.myRank ? (
                  <>
                    {' '}
                    · hạng <b>{c.myRank}</b>/{c.participants}
                  </>
                ) : null}
              </div>
            )}
            {c.inProgressAttemptId ? (
              <Button type="primary" block icon={<PlayCircleOutlined />} onClick={() => router.push(`/student/attempts/${c.inProgressAttemptId}`)} style={{ marginBottom: 12 }}>
                Tiếp tục làm bài
              </Button>
            ) : c.canStart ? (
              <Button type="primary" block icon={<PlayCircleOutlined />} onClick={() => router.push(`/student/tests/${c.id}`)} style={{ marginBottom: 12 }}>
                Tham gia cuộc thi
              </Button>
            ) : null}
            <Typography.Text strong>Top 10</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <LeaderboardTable rows={c.top} meId={student?.id} compact />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

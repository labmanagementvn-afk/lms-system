'use client';

import { ArrowLeftOutlined, PlayCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Descriptions, List, Space, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { LeaderboardTable } from '@/components/assessments/LeaderboardTable';
import { KIND_COLOR, LeaderboardRow, score, StudentTest } from '@/components/assessments/model';
import { testState, useStartAttempt } from '@/components/assessments/student';
import { countdown, formatDateTime, formatDuration } from '@/components/lms/format';
import { useAuth } from '@/lib/auth';
import { ATTEMPT_STATUS, TEST_KIND } from '@/lib/labels';

/** One test: rules, my attempts, the start / resume button and, for contests, the leaderboard. */
export default function StudentTestPage() {
  const { id } = useParams<{ id: string }>();
  const { modal } = App.useApp();
  const { me } = useAuth();
  const router = useRouter();
  const tz = me!.school.timezone;
  const { data: test, error, isLoading } = useSWR<StudentTest>([`/student/tests/${id}`]);
  const board = useSWR<{ rows: LeaderboardRow[]; me: LeaderboardRow | null; total: number }>(test?.kind === 'CONTEST' ? [`/student/tests/${id}/leaderboard`] : null);
  const { start, starting } = useStartAttempt();

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !test) return <Alert type="error" showIcon message={error?.message ?? 'Không tìm thấy bài kiểm tra'} />;

  const used = test.myAttempts.filter((a) => a.status !== 'IN_PROGRESS').length;
  const state = testState(test);
  const back = test.kind === 'CONTEST' ? { href: '/student/contests', label: 'Cuộc thi' } : { href: '/student/tests', label: 'Bài kiểm tra' };

  function confirmStart() {
    modal.confirm({
      title: used ? `Làm lại lần ${used + 1}?` : 'Bắt đầu làm bài?',
      content: (
        <>
          Bài có {test!.questionCount} câu, tổng {score(test!.maxScore)} điểm.
          <br />
          {test!.timeLimitMin ? `Thời gian làm bài ${test!.timeLimitMin} phút, đồng hồ chạy ngay khi em bắt đầu và bài tự nộp khi hết giờ.` : 'Bài không giới hạn thời gian.'}
          {test!.closeAt && (
            <>
              <br />
              Hạn nộp {formatDateTime(test!.closeAt, tz)}.
            </>
          )}
        </>
      ),
      okText: 'Bắt đầu',
      cancelText: 'Để sau',
      onOk: () => start(test!.id),
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href={back.href}>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }}>
          {back.label}
        </Button>
      </Link>
      <Card size="small">
        <Space size={4} wrap style={{ marginBottom: 4 }}>
          <Tag color={KIND_COLOR[test.kind]}>{TEST_KIND[test.kind]}</Tag>
          <Tag color={state.color}>{state.label}</Tag>
        </Space>
        <Typography.Title level={4} style={{ margin: '4px 0 8px' }}>
          {test.title}
        </Typography.Title>
        {test.description && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{test.description}</Typography.Paragraph>}
        <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Môn">{test.subject?.name ?? '—'}</Descriptions.Item>
          {test.course && <Descriptions.Item label="Khóa học">{test.course.title}</Descriptions.Item>}
          <Descriptions.Item label="Số câu">
            {test.questionCount} câu · {score(test.maxScore)} điểm
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian">{test.timeLimitMin ? `${test.timeLimitMin} phút` : 'Không giới hạn'}</Descriptions.Item>
          <Descriptions.Item label="Lượt làm">
            {used}/{test.maxAttempts}
          </Descriptions.Item>
          <Descriptions.Item label="Điểm đạt">{test.passPercent ?? 50}%</Descriptions.Item>
          {test.openAt && <Descriptions.Item label="Mở lúc">{formatDateTime(test.openAt, tz)}</Descriptions.Item>}
          <Descriptions.Item label="Hạn nộp">{test.closeAt ? `${formatDateTime(test.closeAt, tz)} (${countdown(test.closeAt)})` : 'Không hạn'}</Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 12 }}>
          {test.inProgressAttemptId ? (
            <Button type="primary" size="large" block icon={<PlayCircleOutlined />} onClick={() => router.push(`/student/attempts/${test.inProgressAttemptId}`)}>
              Tiếp tục làm bài
            </Button>
          ) : test.canStart ? (
            <Button type="primary" size="large" block icon={<PlayCircleOutlined />} loading={starting === test.id} onClick={confirmStart}>
              {used ? 'Làm lại' : 'Bắt đầu làm bài'}
            </Button>
          ) : (
            <Alert type="info" showIcon message={test.reason ?? 'Em không thể làm bài này lúc này'} />
          )}
        </div>
      </Card>
      {test.myAttempts.length > 0 && (
        <Card size="small" title="Bài làm của em" styles={{ body: { padding: 0 } }}>
          <List
            dataSource={[...test.myAttempts].reverse()}
            renderItem={(a) => (
              <Link href={`/student/attempts/${a.id}`} style={{ display: 'block', color: 'inherit' }}>
                <List.Item style={{ padding: '10px 16px' }} extra={<RightOutlined style={{ color: '#9ca3af' }} />}>
                  <List.Item.Meta
                    title={
                      <Space wrap size={6}>
                        <span>Lần {a.attemptNo}</span>
                        <Tag color={ATTEMPT_STATUS[a.status]?.color}>{a.status === 'IN_PROGRESS' ? 'Đang làm' : a.needsGrading ? 'Chờ chấm tự luận' : 'Đã chấm'}</Tag>
                      </Space>
                    }
                    description={
                      a.status === 'IN_PROGRESS'
                        ? 'Bấm để làm tiếp'
                        : `${score(a.score)}/${score(a.maxScore)} điểm (${a.percent}%) · ${formatDuration(a.durationSec)} · ${formatDateTime(a.submittedAt, tz)}`
                    }
                  />
                </List.Item>
              </Link>
            )}
          />
        </Card>
      )}
      {test.kind === 'CONTEST' && (
        <Card size="small" title="Bảng xếp hạng" extra={board.data?.me ? <Tag color="blue">Hạng của em: {board.data.me.rank}/{board.data.total}</Tag> : null}>
          <LeaderboardTable rows={board.data?.rows ?? []} meId={board.data?.me?.student.id} compact loading={board.isLoading} />
        </Card>
      )}
    </div>
  );
}

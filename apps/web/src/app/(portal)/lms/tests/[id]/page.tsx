'use client';

import { ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Descriptions, Popconfirm, Space, Spin, Tabs, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { AttemptsTab } from '@/components/assessments/AttemptsTab';
import { LeaderboardTable } from '@/components/assessments/LeaderboardTable';
import { KIND_COLOR, LeaderboardRow, score } from '@/components/assessments/model';
import { StatsTab } from '@/components/assessments/StatsTab';
import { TestForm } from '@/components/assessments/TestForm';
import { TestQuestionsTab } from '@/components/assessments/TestQuestionsTab';
import { downloadCsv } from '@/components/grades/download';
import { formatDateTime } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { TEST_KIND, TEST_STATUS } from '@/lib/labels';

/** A test's settings, questions, attempts with grading, leaderboard and statistics. */
export default function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const router = useRouter();
  const tz = me!.school.timezone;
  const { data: test, error, isLoading, mutate } = useSWR<any>([`/lms/tests/${id}`]);
  const board = useSWR<{ rows: LeaderboardRow[]; total: number }>([`/lms/tests/${id}/leaderboard`, { limit: 200 }]);
  const { data: classes } = useClasses();
  const { mutate: revalidate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('questions');

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !test) return <Alert type="error" message={error?.message ?? 'Không tìm thấy bài kiểm tra'} />;

  async function act(fn: () => Promise<any>, ok: string) {
    try {
      const r = await fn();
      mutate(r, false);
      message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const className = (cid: string) => classes?.find((c) => c.id === cid)?.name ?? '?';
  const audience = test.classIds.length ? test.classIds.map(className).join(', ') : test.course ? `Học sinh khóa học "${test.course.title}"` : test.kind === 'CONTEST' ? 'Toàn trường' : 'Chưa giao lớp';

  function publish() {
    modal.confirm({
      title: 'Giao bài kiểm tra?',
      content: `${audience === 'Chưa giao lớp' ? 'Chưa chọn lớp hay khóa học nên học sinh sẽ không thấy bài này. ' : `Giao cho: ${audience}. `}Học sinh nhận thông báo và bắt đầu làm được${test.openAt ? ` từ ${formatDateTime(test.openAt, tz)}` : ' ngay'}.`,
      okText: 'Giao bài',
      cancelText: 'Hủy',
      onOk: () => act(() => api(`/lms/tests/${id}/publish`, { method: 'POST' }), 'Đã giao bài kiểm tra'),
    });
  }

  const status = TEST_STATUS[test.status];
  const refreshResults = () => {
    mutate();
    board.mutate();
    revalidate((key) => Array.isArray(key) && key[0] === `/lms/tests/${id}/stats`);
  };

  return (
    <>
      <Link href="/lms/tests">
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }}>
          Bài kiểm tra & cuộc thi
        </Button>
      </Link>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <Space align="center" wrap style={{ marginBottom: 8 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {test.title}
              </Typography.Title>
              <Tag color={KIND_COLOR[test.kind]}>{TEST_KIND[test.kind]}</Tag>
              <Tag color={status?.color}>{status?.label ?? test.status}</Tag>
            </Space>
            <Descriptions size="small" column={{ xs: 1, md: 3 }}>
              <Descriptions.Item label="Môn / khối">{[test.subject?.name, test.gradeLevel ? `Khối ${test.gradeLevel}` : null].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
              <Descriptions.Item label="Giao cho">{audience}</Descriptions.Item>
              <Descriptions.Item label="Khóa học">{test.course ? <Link href={`/lms/courses/${test.course.id}`}>{test.course.title}</Link> : '—'}</Descriptions.Item>
              <Descriptions.Item label="Câu hỏi">
                {test.questionCount} câu · {score(test.maxScore)} điểm
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian">{test.timeLimitMin ? `${test.timeLimitMin} phút` : 'Không giới hạn'}</Descriptions.Item>
              <Descriptions.Item label="Số lần làm">{test.maxAttempts}</Descriptions.Item>
              <Descriptions.Item label="Mở lúc">{test.openAt ? formatDateTime(test.openAt, tz) : 'Khi giao bài'}</Descriptions.Item>
              <Descriptions.Item label="Hạn nộp">{test.closeAt ? formatDateTime(test.closeAt, tz) : 'Không hạn'}</Descriptions.Item>
              <Descriptions.Item label="Điểm đạt">{test.passPercent ?? 50}%</Descriptions.Item>
              <Descriptions.Item label="Tùy chọn">
                {[test.shuffleQuestions && 'xáo câu hỏi', test.shuffleOptions && 'xáo phương án', test.showResults ? 'hiện đáp án sau khi nộp' : 'ẩn đáp án'].filter(Boolean).join(', ')}
              </Descriptions.Item>
            </Descriptions>
            {test.description && (
              <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {test.description}
              </Typography.Paragraph>
            )}
          </div>
          <Space direction="vertical">
            {test.status !== 'CLOSED' && (
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)} block>
                Sửa thông tin
              </Button>
            )}
            {test.status === 'DRAFT' && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={publish} disabled={!test.questionCount} block>
                Giao bài
              </Button>
            )}
            {test.status === 'PUBLISHED' && (
              <Popconfirm title="Đóng bài? Học sinh không thể bắt đầu lượt làm mới." okText="Đóng bài" cancelText="Hủy" onConfirm={() => act(() => api(`/lms/tests/${id}/close`, { method: 'POST' }), 'Đã đóng bài kiểm tra')}>
                <Button icon={<StopOutlined />} block>
                  Đóng bài
                </Button>
              </Popconfirm>
            )}
            {test.attemptCount > 0 && (
              <Button icon={<DownloadOutlined />} block onClick={() => downloadCsv(`/lms/tests/${id}/export`, {}, `ket-qua-${id}.csv`).catch((e) => message.error(e.message))}>
                Xuất kết quả CSV
              </Button>
            )}
            {test.status === 'DRAFT' && (
              <Popconfirm
                title="Xóa bài kiểm tra nháp này?"
                okText="Xóa"
                cancelText="Hủy"
                onConfirm={async () => {
                  try {
                    await api(`/lms/tests/${id}`, { method: 'DELETE' });
                    message.success('Đã xóa bài kiểm tra');
                    router.replace('/lms/tests');
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                <Button danger icon={<DeleteOutlined />} block>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      </Card>
      {test.status === 'DRAFT' && !test.questionCount && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Thêm câu hỏi rồi bấm Giao bài để học sinh nhận được bài kiểm tra." />}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'questions', label: `Câu hỏi (${test.questionCount})`, children: <TestQuestionsTab test={test} onChanged={(t) => mutate(t, false)} /> },
          {
            key: 'attempts',
            label: `Bài làm (${test.attemptCount})${test.needsGrading ? ` · ${test.needsGrading} chờ chấm` : ''}`,
            children: <AttemptsTab testId={id} tz={tz} onGraded={refreshResults} />,
          },
          {
            key: 'leaderboard',
            label: 'Bảng xếp hạng',
            children: <LeaderboardTable rows={board.data?.rows ?? []} loading={board.isLoading} submittedAt={(iso) => formatDateTime(iso, tz)} />,
          },
          { key: 'stats', label: 'Thống kê', children: <StatsTab testId={id} /> },
        ]}
      />
      <TestForm open={editing} initial={test} onClose={() => setEditing(false)} onSaved={(t) => mutate(t, false)} />
    </>
  );
}

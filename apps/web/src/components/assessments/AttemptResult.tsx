'use client';

import { CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, MinusCircleFilled, ReloadOutlined, TrophyOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { formatDateTime, formatDuration } from '@/components/lms/format';
import { useAuth } from '@/lib/auth';
import { QUESTION_TYPE } from '@/lib/labels';
import { AnswerReview, PointsTag } from './AnswerReview';
import { QuestionType, score, StudentTest } from './model';
import { useStartAttempt } from './student';

export interface AttemptResultData {
  id: string;
  attemptNo: number;
  status: 'SUBMITTED' | 'GRADED' | 'IN_PROGRESS';
  score: number | null;
  maxScore: number;
  percent: number;
  submittedAt: string | null;
  durationSec: number | null;
  needsGrading: boolean;
  startedAt: string;
  passed: boolean;
  passPercent: number;
  test: { id: string; title: string; kind: string; showResults: boolean; questionCount: number };
  questions:
    | null
    | {
        id: string;
        index: number;
        type: QuestionType;
        content: string;
        options: unknown;
        explanation: string | null;
        myAnswer: unknown;
        correctAnswer: unknown;
        correct: boolean | null;
        points: number | null;
        max: number;
        manual: boolean;
      }[];
}

/** The student's score, pass / fail and, when the teacher allows it, each question with the key and explanation. */
export function AttemptResult({ result }: { result: AttemptResultData }) {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { data: test } = useSWR<StudentTest>([`/student/tests/${result.test.id}`]);
  const { start, starting } = useStartAttempt();
  const isContest = result.test.kind === 'CONTEST';
  const qs = result.questions ?? [];
  const counts = {
    right: qs.filter((q) => q.correct === true).length,
    partial: qs.filter((q) => q.correct === false && (q.points ?? 0) > 0).length,
    wrong: qs.filter((q) => q.correct === false && !q.points).length,
    pending: qs.filter((q) => q.points === null).length,
  };
  const color = result.needsGrading ? '#d97706' : result.passed ? '#16a34a' : '#dc2626';

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small" styles={{ body: { textAlign: 'center', padding: 20 } }}>
        <Typography.Text type="secondary">{result.test.title}</Typography.Text>
        <div style={{ fontSize: 44, fontWeight: 700, color, lineHeight: 1.2, margin: '8px 0' }}>
          {score(result.score)}
          <span style={{ fontSize: 22, color: '#6b7280', fontWeight: 500 }}> / {score(result.maxScore)}</span>
        </div>
        <Space wrap style={{ justifyContent: 'center' }}>
          {result.needsGrading ? <Tag color="orange">Chờ giáo viên chấm phần tự luận</Tag> : <Tag color={result.passed ? 'green' : 'red'}>{result.passed ? 'Đạt' : 'Chưa đạt'}</Tag>}
          <Tag>{result.percent}% · cần {result.passPercent}% để đạt</Tag>
          <Tag>Lần {result.attemptNo}</Tag>
        </Space>
        <div style={{ marginTop: 8, color: '#4b5563', fontSize: 13 }}>
          Làm trong {formatDuration(result.durationSec)} · nộp lúc {formatDateTime(result.submittedAt, tz)}
        </div>
        {result.questions && (
          <Space wrap style={{ justifyContent: 'center', marginTop: 12 }}>
            <span style={{ color: '#16a34a' }}>
              <CheckCircleFilled /> {counts.right} đúng
            </span>
            {counts.partial > 0 && (
              <span style={{ color: '#ca8a04' }}>
                <MinusCircleFilled /> {counts.partial} đúng một phần
              </span>
            )}
            <span style={{ color: '#dc2626' }}>
              <CloseCircleFilled /> {counts.wrong} sai
            </span>
            {counts.pending > 0 && (
              <span style={{ color: '#d97706' }}>
                <ClockCircleFilled /> {counts.pending} chờ chấm
              </span>
            )}
          </Space>
        )}
        <Space wrap style={{ justifyContent: 'center', marginTop: 16 }}>
          <Link href={isContest ? '/student/contests' : '/student/tests'}>
            <Button icon={<UnorderedListOutlined />}>{isContest ? 'Các cuộc thi' : 'Danh sách bài kiểm tra'}</Button>
          </Link>
          {isContest && (
            <Link href={`/student/tests/${result.test.id}`}>
              <Button icon={<TrophyOutlined />}>Bảng xếp hạng</Button>
            </Link>
          )}
          {test?.canStart && (
            <Button type="primary" icon={<ReloadOutlined />} loading={starting === test.id} onClick={() => start(test.id)}>
              Làm lại ({test.myAttempts.filter((a) => a.status !== 'IN_PROGRESS').length}/{test.maxAttempts} lượt)
            </Button>
          )}
        </Space>
      </Card>
      {!result.questions && <Alert type="info" showIcon message="Giáo viên chưa công bố đáp án cho bài này. Em xem điểm ở đây và trong mục Điểm số khi giáo viên vào điểm." />}
      {qs.map((q) => (
        <Card
          key={q.id}
          size="small"
          title={
            <Space wrap>
              <span>Câu {q.index + 1}</span>
              <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                {QUESTION_TYPE[q.type]}
              </Typography.Text>
            </Space>
          }
          extra={<PointsTag points={q.points} max={q.max} correct={q.correct} manual={q.manual} />}
        >
          <AnswerReview question={q} myAnswer={q.myAnswer} correctAnswer={q.correctAnswer} />
          {q.explanation && (
            <Alert
              type="info"
              style={{ marginTop: 10 }}
              message={
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {q.type === 'ESSAY' && <b>Đáp án tham khảo: </b>}
                  {q.explanation}
                </span>
              }
            />
          )}
        </Card>
      ))}
    </div>
  );
}

'use client';

import { Alert, App, Button, Card, Descriptions, Drawer, InputNumber, Space, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formatDateTime, formatDuration } from '@/components/lms/format';
import { api } from '@/lib/api';
import { ATTEMPT_STATUS, QUESTION_TYPE } from '@/lib/labels';
import { AnswerReview, PointsTag } from './AnswerReview';
import { QuestionType, score } from './model';

interface DetailQuestion {
  id: string;
  index: number;
  type: QuestionType;
  content: string;
  options: unknown;
  points: number;
  explanation: string | null;
  myAnswer: unknown;
  correctAnswer: unknown;
  grading: { points: number | null; max: number; correct: boolean | null; manual: boolean } | null;
}

/** One student's attempt with every answer next to the key; the teacher fills essay marks or overrides any question. */
export function GradingDrawer({ attemptId, tz, onClose, onGraded }: { attemptId: string | null; tz: string; onClose: () => void; onGraded: () => void }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any>(attemptId ? [`/lms/attempts/${attemptId}`] : null);
  const [marks, setMarks] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMarks(Object.fromEntries((data.questions as DetailQuestion[]).map((q) => [q.id, q.grading?.points ?? null])));
  }, [data]);

  const questions: DetailQuestion[] = data?.questions ?? [];
  const changed = questions.filter((q) => marks[q.id] !== null && marks[q.id] !== undefined && marks[q.id] !== (q.grading?.points ?? null));
  const pending = questions.filter((q) => q.grading && q.grading.points === null && (marks[q.id] === null || marks[q.id] === undefined)).length;

  async function save() {
    setSaving(true);
    try {
      const items = Object.fromEntries(changed.map((q) => [q.id, marks[q.id] as number]));
      const r = await api(`/lms/attempts/${attemptId}/grade`, { method: 'PUT', body: { items } });
      mutate(r, false);
      message.success(r.needsGrading ? 'Đã lưu điểm, bài làm còn câu chờ chấm' : `Đã chấm xong: ${score(r.score)}/${score(r.maxScore)} điểm`);
      onGraded();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const finished = data && data.status !== 'IN_PROGRESS';

  return (
    <Drawer
      title={data ? `Bài làm của ${data.student.fullName}` : 'Bài làm'}
      open={!!attemptId}
      onClose={onClose}
      width={820}
      extra={
        finished && (
          <Button type="primary" loading={saving} disabled={!changed.length} onClick={save}>
            Lưu điểm{changed.length ? ` (${changed.length})` : ''}
          </Button>
        )
      }
    >
      {isLoading || !data ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : (
        <>
          <Descriptions size="small" column={{ xs: 1, md: 3 }} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Học sinh">
              {data.student.fullName} ({data.student.code})
            </Descriptions.Item>
            <Descriptions.Item label="Lớp">{data.student.className ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Lần làm">{data.attemptNo}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={ATTEMPT_STATUS[data.status]?.color}>{ATTEMPT_STATUS[data.status]?.label ?? data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Điểm">
              <b>{score(data.score)}</b>/{score(data.maxScore)} ({data.percent}%)
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian làm">{data.durationSec !== null ? formatDuration(data.durationSec) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Nộp lúc">{formatDateTime(data.submittedAt, tz) || '—'}</Descriptions.Item>
            {data.gradedAt && <Descriptions.Item label="Chấm lúc">{formatDateTime(data.gradedAt, tz)}</Descriptions.Item>}
          </Descriptions>
          {!finished && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Học sinh đang làm bài. Có thể chấm sau khi học sinh nộp bài hoặc hết giờ." />}
          {finished && pending > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Còn ${pending} câu tự luận chờ chấm. Nhập điểm rồi bấm "Lưu điểm".`} />}
          <div style={{ display: 'grid', gap: 12 }}>
            {questions.map((q) => (
              <Card
                key={q.id}
                size="small"
                style={q.grading?.points === null ? { borderColor: '#fdba74' } : undefined}
                title={
                  <Space wrap>
                    <span>Câu {q.index + 1}</span>
                    <Tag>{QUESTION_TYPE[q.type] ?? q.type}</Tag>
                    {q.grading && <PointsTag {...q.grading} />}
                  </Space>
                }
                extra={
                  finished &&
                  q.grading && (
                    <Space size={4}>
                      <Typography.Text type="secondary">Điểm</Typography.Text>
                      <InputNumber
                        size="small"
                        min={0}
                        max={q.grading.max}
                        decimalSeparator=","
                        value={marks[q.id]}
                        onChange={(v) => setMarks((m) => ({ ...m, [q.id]: v === null ? null : Number(v) }))}
                        style={{ width: 80 }}
                        aria-label={`Điểm câu ${q.index + 1}`}
                      />
                      <Typography.Text type="secondary">/ {q.grading.max}</Typography.Text>
                    </Space>
                  )
                }
              >
                <AnswerReview question={q} myAnswer={q.myAnswer} correctAnswer={q.correctAnswer} who="Học sinh" />
                {q.explanation && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                    <b>{q.type === 'ESSAY' ? 'Gợi ý chấm' : 'Giải thích'}:</b> {q.explanation}
                  </Typography.Paragraph>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}

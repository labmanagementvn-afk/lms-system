'use client';

import { Card, Col, Empty, Progress, Row, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import useSWR from 'swr';
import { DIFFICULTY, QUESTION_TYPE } from '@/lib/labels';
import { DIFFICULTY_COLOR } from './model';

interface Stats {
  attempts: number;
  students: number;
  avgPercent: number;
  passPercent: number;
  passRate: number;
  needsGrading: number;
  perQuestion: { questionId: string; content: string; type: string; difficulty: number; points: number; answered: number; correctRate: number | null }[];
  distribution: { from: number; to: number; count: number }[];
}

const rateColor = (r: number) => (r >= 80 ? '#16a34a' : r >= 50 ? '#2563eb' : r >= 30 ? '#d97706' : '#dc2626');

/** Participation, pass rate, score histogram and per-question success, from each student's best attempt. */
export function StatsTab({ testId }: { testId: string }) {
  const { data, isLoading } = useSWR<Stats>([`/lms/tests/${testId}/stats`]);
  if (isLoading || !data) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!data.attempts) return <Empty description="Chưa có bài làm nào để thống kê" />;
  const peak = Math.max(1, ...data.distribution.map((d) => d.count));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Học sinh đã làm" value={data.students} suffix={<span style={{ fontSize: 13, color: '#6b7280' }}>· {data.attempts} lượt</span>} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Điểm trung bình" value={data.avgPercent} suffix="%" precision={1} decimalSeparator="," />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={`Tỷ lệ đạt (≥ ${data.passPercent}%)`} value={data.passRate} suffix="%" precision={1} decimalSeparator="," valueStyle={{ color: rateColor(data.passRate) }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Bài chờ chấm" value={data.needsGrading} valueStyle={{ color: data.needsGrading ? '#d97706' : undefined }} />
          </Card>
        </Col>
      </Row>
      <Card size="small" title="Phổ điểm (theo % điểm tối đa, lấy lần làm tốt nhất)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6, alignItems: 'end', height: 180 }}>
          {data.distribution.map((d) => (
            <Tooltip key={d.from} title={`${d.from}–${d.to}%: ${d.count} học sinh`}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: 12, marginBottom: 2 }}>{d.count || ''}</span>
                <div style={{ width: '100%', height: `${(d.count / peak) * 140}px`, minHeight: d.count ? 4 : 0, background: d.from >= data.passPercent ? '#3b82f6' : '#f97316', borderRadius: '4px 4px 0 0' }} />
              </div>
            </Tooltip>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6, marginTop: 4 }}>
          {data.distribution.map((d) => (
            <span key={d.from} style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
              {d.from}–{d.to}
            </span>
          ))}
        </div>
      </Card>
      <Card size="small" title="Tỷ lệ làm đúng theo câu hỏi">
        <Table
          size="small"
          rowKey="questionId"
          pagination={false}
          dataSource={data.perQuestion}
          scroll={{ x: 760 }}
          columns={[
            { title: '#', width: 50, render: (_, __, i) => i + 1 },
            { title: 'Câu hỏi', render: (_, q) => <Typography.Text ellipsis={{ tooltip: q.content }} style={{ maxWidth: 360 }}>{q.content}</Typography.Text> },
            { title: 'Loại', width: 140, render: (_, q) => QUESTION_TYPE[q.type] ?? q.type },
            { title: 'Mức độ', width: 120, render: (_, q) => <Tag color={DIFFICULTY_COLOR[q.difficulty]}>{DIFFICULTY[q.difficulty]}</Tag> },
            { title: 'Điểm', width: 60, align: 'right', dataIndex: 'points' },
            { title: 'Lượt chấm', width: 90, align: 'right', dataIndex: 'answered' },
            {
              title: 'Tỷ lệ đúng',
              width: 180,
              render: (_, q) => (q.correctRate === null ? <Typography.Text type="secondary">Chưa có</Typography.Text> : <Progress percent={q.correctRate} size="small" strokeColor={rateColor(q.correctRate)} format={(p) => `${p}%`} />),
            },
          ]}
        />
      </Card>
    </div>
  );
}

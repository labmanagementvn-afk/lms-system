'use client';

import { Button, Checkbox, Input, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { formatDateTime, formatDuration } from '@/components/lms/format';
import { ATTEMPT_STATUS } from '@/lib/labels';
import { GradingDrawer } from './GradingDrawer';
import { AttemptSummary, normalizeText, score, StudentRef } from './model';

interface Row {
  student: StudentRef;
  attemptCount: number;
  best: (AttemptSummary & { rank: number }) | null;
  latest: AttemptSummary;
  attempts: AttemptSummary[];
  needsGrading: boolean;
}

const StatusTag = ({ a }: { a: AttemptSummary }) => <Tag color={ATTEMPT_STATUS[a.status]?.color}>{ATTEMPT_STATUS[a.status]?.label ?? a.status}</Tag>;

/** One row per student with their best and latest attempt; opens the grading drawer. */
export function AttemptsTab({ testId, tz, onGraded }: { testId: string; tz: string; onGraded: () => void }) {
  const { data, isLoading, mutate } = useSWR<{ rows: Row[]; total: number; needsGrading: number }>([`/lms/tests/${testId}/attempts`]);
  const [onlyPending, setOnlyPending] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const rows = (data?.rows ?? []).filter((r) => (!onlyPending || r.needsGrading) && (!q || normalizeText(`${r.student.fullName} ${r.student.code}`).includes(normalizeText(q))));
  const target = (r: Row) => r.attempts.find((a) => a.needsGrading)?.id ?? r.best?.id ?? r.latest.id;

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm học sinh" allowClear style={{ width: 220 }} onSearch={setQ} onChange={(e) => !e.target.value && setQ('')} />
        <Checkbox checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)}>
          Chỉ bài chờ chấm{data?.needsGrading ? ` (${data.needsGrading})` : ''}
        </Checkbox>
      </Space>
      <Table<Row>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={rows}
        scroll={{ x: 900 }}
        pagination={rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        locale={{ emptyText: 'Chưa có học sinh nào làm bài' }}
        expandable={{
          rowExpandable: (r) => r.attempts.length > 1,
          expandedRowRender: (r) => (
            <Table<AttemptSummary>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={r.attempts}
              columns={[
                { title: 'Lần', dataIndex: 'attemptNo', width: 60 },
                { title: 'Trạng thái', width: 120, render: (_, a) => <StatusTag a={a} /> },
                { title: 'Điểm', width: 110, render: (_, a) => `${score(a.score)}/${score(a.maxScore)}` },
                { title: 'Tỷ lệ', width: 80, render: (_, a) => (a.status === 'IN_PROGRESS' ? '' : `${a.percent}%`) },
                { title: 'Thời gian', width: 110, render: (_, a) => (a.durationSec !== null ? formatDuration(a.durationSec) : '') },
                { title: 'Nộp lúc', width: 150, render: (_, a) => formatDateTime(a.submittedAt, tz) },
                {
                  title: '',
                  width: 90,
                  render: (_, a) => (
                    <Button size="small" onClick={() => setOpen(a.id)}>
                      {a.needsGrading ? 'Chấm' : 'Xem'}
                    </Button>
                  ),
                },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: 'Học sinh',
            render: (_, r) => (
              <>
                {r.student.fullName}
                <div style={{ fontSize: 12, color: '#6b7280' }}>{r.student.code}</div>
              </>
            ),
          },
          { title: 'Lớp', width: 80, render: (_, r) => r.student.className ?? '' },
          { title: 'Số lần', width: 80, align: 'right', dataIndex: 'attemptCount' },
          {
            title: 'Điểm cao nhất',
            width: 150,
            render: (_, r) =>
              r.best ? (
                <span>
                  <b>{score(r.best.score)}</b>/{score(r.best.maxScore)} · {r.best.percent}%
                </span>
              ) : (
                '—'
              ),
          },
          { title: 'Lần gần nhất', width: 130, render: (_, r) => <StatusTag a={r.latest} /> },
          { title: 'Nộp lúc', width: 150, render: (_, r) => formatDateTime(r.latest.submittedAt, tz) },
          {
            title: '',
            width: 130,
            render: (_, r) =>
              r.needsGrading ? (
                <Button size="small" type="primary" onClick={() => setOpen(target(r))}>
                  Chấm bài
                </Button>
              ) : (
                <Button size="small" onClick={() => setOpen(target(r))}>
                  Xem bài làm
                </Button>
              ),
          },
        ]}
      />
      <GradingDrawer
        attemptId={open}
        tz={tz}
        onClose={() => setOpen(null)}
        onGraded={() => {
          mutate();
          onGraded();
        }}
      />
    </>
  );
}

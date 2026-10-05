'use client';

import { TrophyFilled } from '@ant-design/icons';
import { Table } from 'antd';
import { formatDuration } from '@/components/lms/format';
import { LeaderboardRow, score } from './model';

const MEDAL = ['#f59e0b', '#9ca3af', '#b45309'];

export function Rank({ rank }: { rank: number }) {
  return rank <= 3 ? (
    <span style={{ color: MEDAL[rank - 1], fontWeight: 700 }}>
      <TrophyFilled /> {rank}
    </span>
  ) : (
    <span style={{ fontWeight: 600 }}>{rank}</span>
  );
}

/** Ranked best attempts: score first, then the faster attempt. `meId` highlights the signed-in student's row. */
export function LeaderboardTable({ rows, meId, compact, loading, submittedAt }: { rows: LeaderboardRow[]; meId?: string; compact?: boolean; loading?: boolean; submittedAt?: (iso: string | null) => string }) {
  return (
    <Table<LeaderboardRow>
      rowKey={(r) => r.student.id}
      size={compact ? 'small' : 'middle'}
      loading={loading}
      dataSource={rows}
      pagination={rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
      scroll={compact ? undefined : { x: 640 }}
      onRow={(r) => (r.student.id === meId ? { style: { background: '#eff6ff', fontWeight: 600 } } : {})}
      locale={{ emptyText: 'Chưa có bài làm nào' }}
      columns={[
        { title: 'Hạng', width: 70, render: (_, r) => <Rank rank={r.rank} /> },
        {
          title: 'Học sinh',
          render: (_, r) => (
            <>
              {r.student.fullName}
              {!compact && <div style={{ fontSize: 12, color: '#6b7280' }}>{r.student.code}</div>}
            </>
          ),
        },
        { title: 'Lớp', width: 80, render: (_, r) => r.student.className ?? '' },
        {
          title: 'Điểm',
          width: compact ? 90 : 120,
          align: 'right',
          render: (_, r) => (
            <span>
              <b>{score(r.score)}</b>/{score(r.maxScore)}
              {r.needsGrading && <span style={{ color: '#d97706' }}> *</span>}
            </span>
          ),
        },
        ...(compact ? [] : [{ title: 'Tỷ lệ', width: 80, align: 'right' as const, render: (_: unknown, r: LeaderboardRow) => `${r.percent}%` }]),
        { title: 'Thời gian', width: compact ? 90 : 120, render: (_, r) => formatDuration(r.durationSec) },
        ...(submittedAt && !compact ? [{ title: 'Nộp lúc', width: 150, render: (_: unknown, r: LeaderboardRow) => submittedAt(r.submittedAt) }] : []),
      ]}
    />
  );
}

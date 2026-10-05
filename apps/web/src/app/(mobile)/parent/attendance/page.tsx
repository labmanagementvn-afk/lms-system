'use client';

import { Card, DatePicker, Empty, List, Spin, Statistic, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { DAY_STATUS, HOMEROOM_STATUS } from '@/lib/labels';
import { useParent } from '@/lib/parent';
import { formatTime, todayIn } from '@/lib/time';

interface Day {
  date: string;
  gate: { status: 'ON_TIME' | 'LATE' | 'ABSENT'; firstIn: string | null; lastOut: string | null } | null;
  homeroom: { status: string; note: string | null } | null;
}

export default function ParentAttendancePage() {
  const tz = useAuth().me!.school.timezone;
  const { child, loading } = useParent();
  const [month, setMonth] = useState<Dayjs>(dayjs(todayIn(tz)));
  const { data, isLoading } = useSWR<{ days: Day[]; summary: Record<string, number> }>(
    child ? [`/parent/children/${child.id}/attendance`, { month: month.format('YYYY-MM') }] : null,
  );

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  const s = data?.summary;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong>Điểm danh · {child.fullName}</Typography.Text>
        <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} format="MM/YYYY" allowClear={false} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          ['Có mặt', s?.present, '#16a34a'],
          ['Muộn', s?.late, '#d97706'],
          ['Vắng', s?.absent, '#dc2626'],
          ['Có phép', s?.excused, '#2563eb'],
        ].map(([label, value, color]) => (
          <Card key={String(label)} size="small" styles={{ body: { padding: 8, textAlign: 'center' } }}>
            <Statistic title={label as string} value={(value as number) ?? 0} valueStyle={{ color: color as string, fontSize: 20 }} />
          </Card>
        ))}
      </div>
      <List
        loading={isLoading}
        dataSource={[...(data?.days ?? [])].reverse()}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu trong tháng" /> }}
        renderItem={(d) => {
          const g = d.gate ? DAY_STATUS[d.gate.status] : null;
          const h = d.homeroom ? HOMEROOM_STATUS[d.homeroom.status] : null;
          return (
            <List.Item style={{ padding: '8px 0' }}>
              <List.Item.Meta
                title={
                  <span>
                    {dayjs(d.date).format('dddd, DD/MM')}{' '}
                    {h && <Tag color={h.color}>{h.label}</Tag>}
                    {g && <Tag color={g.color}>Cổng: {g.label}</Tag>}
                  </span>
                }
                description={
                  <>
                    {d.gate && (
                      <span>
                        {d.gate.firstIn ? `Vào ${formatTime(d.gate.firstIn, tz)}` : ''}
                        {d.gate.firstIn && d.gate.lastOut ? ' · ' : ''}
                        {d.gate.lastOut ? `Ra ${formatTime(d.gate.lastOut, tz)}` : ''}
                      </span>
                    )}
                    {d.homeroom?.note && <div>Ghi chú: {d.homeroom.note}</div>}
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
    </div>
  );
}

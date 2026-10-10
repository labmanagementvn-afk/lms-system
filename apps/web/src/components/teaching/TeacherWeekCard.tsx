'use client';

import { Button, Card, Empty, Space, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import useSWR from 'swr';
import { DAY, dmy } from '@/lib/labels';
import { CalendarWeek } from '@/lib/teaching';

/** The teacher's periods this week from the timetable, marking those whose lesson is not in the lịch báo giảng yet. */
export function TeacherWeekCard({ teacherId }: { teacherId: string }) {
  const { data } = useSWR<CalendarWeek>(['/teaching/calendar', { teacherId }]);
  const today = dayjs().format('YYYY-MM-DD');
  const missing = data ? data.days.reduce((a, d) => a + d.slots.filter((s) => s.scheduled && !s.plan).length, 0) : 0;
  return (
    <Card
      size="small"
      title={`Lịch dạy tuần này${data?.week.number ? ` (tuần ${data.week.number})` : ''}`}
      extra={
        <Link href="/teaching/calendar">
          <Button size="small" type={missing ? 'primary' : 'default'}>
            {missing ? `Báo giảng ${missing} tiết còn thiếu` : 'Lịch báo giảng'}
          </Button>
        </Link>
      }
      style={{ height: '100%' }}
    >
      {!data ? null : !data.periods && !data.planned ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tuần này không có tiết dạy trên thời khóa biểu" />
      ) : (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {data.days.map((d) => (
            <div key={d.date} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 6px', borderRadius: 4, background: d.date === today ? '#f0f5ff' : undefined }}>
              <Typography.Text strong style={{ width: 112, flex: 'none' }}>
                {DAY[d.dayOfWeek]} {dmy(d.date).slice(0, 5)}
              </Typography.Text>
              <Space size={[4, 4]} wrap>
                {d.slots.length ? (
                  d.slots.map((s) => (
                    <Tooltip key={s.periodNumber} title={s.plan ? `${s.plan.lessonNo ? `Tiết ${s.plan.lessonNo}: ` : ''}${s.plan.title}` : 'Chưa báo giảng'}>
                      <Tag color={s.plan ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>
                        T{s.periodNumber} · {s.class.name} {s.subject.name}
                      </Tag>
                    </Tooltip>
                  ))
                ) : (
                  <Typography.Text type="secondary">Không có tiết</Typography.Text>
                )}
              </Space>
            </div>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Đã báo giảng {data.planned}/{data.periods} tiết. Bài đã báo giảng hiện sẵn khi ghi sổ đầu bài.
          </Typography.Text>
        </Space>
      )}
    </Card>
  );
}

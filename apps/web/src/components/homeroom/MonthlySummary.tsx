'use client';

import { DatePicker, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { HOMEROOM_STATUS } from '@/lib/labels';
import { todayIn } from '@/lib/time';

const LETTER: Record<string, string> = { PRESENT: 'C', ABSENT: 'V', LATE: 'M', EXCUSED: 'P' };

/** One row per student, one column per marked day, with the month's totals. */
export function MonthlySummary({ classId }: { classId?: string }) {
  const tz = useAuth().me!.school.timezone;
  const [month, setMonth] = useState<Dayjs>(dayjs(todayIn(tz)));
  const { data, isLoading } = useSWR<any>(classId ? ['/homeroom/attendance/summary', { classId, month: month.format('YYYY-MM') }] : null);
  const days: any[] = data?.days ?? [];
  const students: any[] = data?.students ?? [];
  const totals = students.reduce(
    (acc, s) => ({ present: acc.present + s.present, absent: acc.absent + s.absent, late: acc.late + s.late, excused: acc.excused + s.excused }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );

  if (!classId) return <Empty description="Chọn lớp để xem tổng hợp" />;

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} format="MM/YYYY" allowClear={false} />
        <Typography.Text type="secondary">C: có mặt · V: vắng · M: đi muộn · P: vắng có phép</Typography.Text>
      </Space>
      <Table<any>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={students}
        size="small"
        bordered
        pagination={false}
        scroll={{ x: 560 + days.length * 46 }}
        columns={[
          { title: 'Họ và tên', fixed: 'left', width: 200, render: (_, r) => r.student.fullName },
          ...days.map((d) => ({
            title: <Tooltip title={dayjs(d.date).format('DD/MM/YYYY')}>{d.date.slice(8)}</Tooltip>,
            key: d.date,
            width: 46,
            align: 'center' as const,
            render: (_: unknown, r: any) => {
              const cell = r.days[d.date];
              if (!cell) return '';
              return (
                <Tooltip title={`${HOMEROOM_STATUS[cell.status].label}${cell.note ? `: ${cell.note}` : ''}`}>
                  <Tag color={HOMEROOM_STATUS[cell.status].color} style={{ margin: 0 }}>
                    {LETTER[cell.status]}
                  </Tag>
                </Tooltip>
              );
            },
          })),
          { title: 'Có mặt', dataIndex: 'present', width: 80, align: 'right' },
          { title: 'Vắng', dataIndex: 'absent', width: 70, align: 'right', render: (v) => (v ? <b style={{ color: '#dc2626' }}>{v}</b> : 0) },
          { title: 'Muộn', dataIndex: 'late', width: 70, align: 'right', render: (v) => (v ? <b style={{ color: '#d97706' }}>{v}</b> : 0) },
          { title: 'Có phép', dataIndex: 'excused', width: 80, align: 'right' },
        ]}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Cả lớp (vắng + có phép)</b>
              </Table.Summary.Cell>
              {days.map((d, i) => (
                <Table.Summary.Cell key={d.date} index={i + 1} align="center">
                  {d.absent + d.excused ? <span style={{ color: '#dc2626' }}>{d.absent + d.excused}</span> : ''}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={days.length + 1} align="right">
                {totals.present}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={days.length + 2} align="right">
                {totals.absent}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={days.length + 3} align="right">
                {totals.late}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={days.length + 4} align="right">
                {totals.excused}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </>
  );
}

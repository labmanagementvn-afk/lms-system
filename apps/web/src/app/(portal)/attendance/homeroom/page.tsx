'use client';

import { Alert, DatePicker, Select, Space, Tabs } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { AttendanceSheet } from '@/components/homeroom/AttendanceSheet';
import { MonthlySummary } from '@/components/homeroom/MonthlySummary';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { todayIn } from '@/lib/time';

export default function HomeroomAttendancePage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [date, setDate] = useState<Dayjs>(dayjs(todayIn(tz)));
  const [tab, setTab] = useState('sheet');

  // Teachers may only mark the classes they are homeroom teacher of; the office sees every class.
  const options = useMemo(
    () =>
      (classes ?? [])
        .filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId)
        .map((c) => ({ value: c.id, label: `Lớp ${c.name}${c.homeroomTeacher ? ` · GVCN ${c.homeroomTeacher.fullName}` : ''}` })),
    [classes, isTeacher, me?.teacherId],
  );

  useEffect(() => {
    if (!classId && options.length) setClassId(options[0].value);
  }, [options, classId]);

  return (
    <>
      <PageHeader
        title="Điểm danh lớp"
        extra={
          <Space wrap>
            <Select placeholder="Chọn lớp" value={classId} onChange={setClassId} style={{ width: 280 }} options={options} showSearch optionFilterProp="label" />
            {tab === 'sheet' && (
              <DatePicker
                value={date}
                onChange={(d) => d && setDate(d)}
                format="DD/MM/YYYY"
                allowClear={false}
                disabledDate={(d) => d.isAfter(dayjs(todayIn(tz)), 'day')}
              />
            )}
          </Space>
        }
      />
      {isTeacher && classes && !options.length && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Bạn chưa được phân công chủ nhiệm lớp nào nên chưa thể điểm danh lớp." />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'sheet', label: 'Điểm danh ngày', children: <AttendanceSheet classId={classId} date={date.format('YYYY-MM-DD')} /> },
          { key: 'month', label: 'Tổng hợp tháng', children: <MonthlySummary classId={classId} /> },
        ]}
      />
    </>
  );
}

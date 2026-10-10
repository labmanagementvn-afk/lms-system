'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { LessonLogDrawer, LogbookCell } from '@/components/homeroom/LessonLogDrawer';
import { useAuth } from '@/lib/auth';
import { useClasses, usePeriods } from '@/lib/hooks';
import { DAY, LESSON_LOG_STATUS } from '@/lib/labels';
import { todayIn } from '@/lib/time';

const toMonday = (d: Dayjs) => d.subtract((d.day() + 6) % 7, 'day');

export default function LogbookPage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const today = todayIn(tz);
  const { data: classes } = useClasses();
  const { data: periods } = usePeriods();
  const [classId, setClassId] = useState<string>();
  const [monday, setMonday] = useState<Dayjs>(() => toMonday(dayjs(today)));
  const [cell, setCell] = useState<LogbookCell | null>(null);
  const from = monday.format('YYYY-MM-DD');
  const to = monday.add(5, 'day').format('YYYY-MM-DD');
  const { data, isLoading, mutate } = useSWR<any>(classId ? ['/homeroom/logbook', { classId, from, to }] : null);
  const { data: stats, mutate: mutateStats } = useSWR<any>(classId ? ['/homeroom/logbook/stats', { classId, from, to }] : null);

  // Teachers start on their homeroom class; everyone else on the first class.
  useEffect(() => {
    if (classId || !classes?.length) return;
    const mine = me?.teacherId ? classes.find((c) => c.homeroomTeacherId === me.teacherId) : undefined;
    setClassId((mine ?? classes[0]).id);
  }, [classes, classId, me?.teacherId]);

  // Rows are the bell schedule's periods, plus any period that has an entry outside it.
  const periodNumbers = useMemo(() => {
    const set = new Set<number>(periods?.map((p) => p.number) ?? []);
    for (const d of data?.days ?? []) for (const s of d.slots) set.add(s.periodNumber);
    return [...set].sort((a, b) => a - b);
  }, [periods, data]);
  const periodInfo = (n: number) => periods?.find((p) => p.number === n);
  const absences = stats?.absences.reduce((sum: number, a: any) => sum + a.count, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Sổ đầu bài"
        extra={
          <Space wrap>
            <Select
              value={classId}
              onChange={setClassId}
              style={{ width: 160 }}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn lớp"
              options={classes?.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))}
            />
            <Button icon={<LeftOutlined />} onClick={() => setMonday(monday.subtract(7, 'day'))} aria-label="Tuần trước" />
            <DatePicker
              picker="week"
              value={monday}
              allowClear={false}
              format={() => `${monday.format('DD/MM')} - ${monday.add(5, 'day').format('DD/MM/YYYY')}`}
              onChange={(d) => d && setMonday(toMonday(d))}
            />
            <Button icon={<RightOutlined />} onClick={() => setMonday(monday.add(7, 'day'))} aria-label="Tuần sau" />
          </Space>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        {stats && (
          <>
            <Tag color="green">Đã dạy {stats.lessons.done} tiết</Tag>
            <Tag>Nghỉ {stats.lessons.cancelled} tiết</Tag>
            <Tag color="blue">Điểm trung bình {stats.averageRating ?? '–'}</Tag>
            <Tag color={absences ? 'red' : 'default'}>{absences} lượt vắng</Tag>
          </>
        )}
        {data && (
          <Typography.Text type="secondary">
            Học kỳ {data.days[0]?.semester ?? ''} · {data.academicYear.name}
            {data.class.homeroomTeacherId && data.class.homeroomTeacherId === me?.teacherId ? ' · Bạn là GVCN lớp này' : ''}
          </Typography.Text>
        )}
      </Space>
      <Typography.Paragraph type="secondary">Bấm vào một tiết để ghi nội dung bài dạy, nhận xét, xếp loại và học sinh vắng.</Typography.Paragraph>
      <Table<any>
        className="timetable"
        rowKey="n"
        bordered
        size="small"
        pagination={false}
        loading={isLoading}
        scroll={{ x: 1100 }}
        dataSource={periodNumbers.map((n) => ({ n }))}
        columns={[
          {
            title: 'Tiết',
            width: 100,
            fixed: 'left',
            render: (_, r) => {
              const p = periodInfo(r.n);
              return (
                <div>
                  <b>Tiết {r.n}</b>
                  {p && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {p.startTime}-{p.endTime}
                    </div>
                  )}
                </div>
              );
            },
          },
          ...(data?.days ?? []).map((d: any) => ({
            title: (
              <div style={d.date === today ? { color: '#1d4ed8' } : undefined}>
                {DAY[d.dayOfWeek]}
                <div style={{ fontSize: 12, fontWeight: 400 }}>{dayjs(d.date).format('DD/MM')}</div>
              </div>
            ),
            key: d.date,
            render: (_: unknown, r: any) => {
              const slot = d.slots.find((s: any) => s.periodNumber === r.n);
              return <LogCell slot={slot ?? null} onClick={() => setCell({ date: d.date, periodNumber: r.n, slot: slot ?? null })} />;
            },
          })),
        ]}
      />
      <LessonLogDrawer
        open={!!cell}
        cell={cell}
        classId={classId}
        students={data?.students ?? []}
        onClose={() => setCell(null)}
        onSaved={() => {
          mutate();
          mutateStats();
        }}
      />
    </>
  );
}

function LogCell({ slot, onClick }: { slot: any | null; onClick: () => void }) {
  if (!slot) {
    return (
      <div className="tt-cell" onClick={onClick} style={{ cursor: 'pointer', minHeight: 56, color: '#cbd5e1', textAlign: 'center' }}>
        +
      </div>
    );
  }
  const log = slot.log;
  return (
    <div className="tt-cell" onClick={onClick} style={{ cursor: 'pointer', minHeight: 56 }}>
      <div style={{ fontWeight: 600 }}>{slot.subject.name}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{slot.teacher.fullName}</div>
      {log ? (
        <div style={{ fontSize: 12, marginTop: 2 }}>
          <Tag color={LESSON_LOG_STATUS[log.status].color} style={{ marginRight: 4 }}>
            {LESSON_LOG_STATUS[log.status].label}
          </Tag>
          {log.rating != null && <span>{log.rating}/10</span>}
          {log.absentStudentIds.length > 0 && <span style={{ color: '#dc2626' }}> · vắng {log.absentStudentIds.length}</span>}
          <div style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{log.content}</div>
        </div>
      ) : (
        <>
          <Tag style={{ marginTop: 4 }}>Chưa ghi</Tag>
          {slot.plan && (
            <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }} title="Theo lịch báo giảng">
              {slot.plan.lessonNo ? `Tiết ${slot.plan.lessonNo}: ` : ''}
              {slot.plan.title}
            </div>
          )}
        </>
      )}
    </div>
  );
}

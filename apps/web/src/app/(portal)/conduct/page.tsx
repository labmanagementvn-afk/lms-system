'use client';

import { Alert, Select, Space, Tabs } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ClassAssessments } from '@/components/conduct/ClassAssessments';
import { ConductSummary } from '@/components/conduct/ConductSummary';
import { CriteriaForm } from '@/components/conduct/CriteriaForm';
import { semesterOf } from '@/components/conduct/types';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { todayIn } from '@/lib/time';

const SEMESTERS = [
  { value: 1, label: 'Học kỳ 1' },
  { value: 2, label: 'Học kỳ 2' },
];
const MONTHS = [{ value: 0, label: 'Cả học kỳ' }, ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }))];

/** Rèn luyện: class assessments (homeroom teachers and the office), the criteria (office) and the school overview. */
export default function ConductPage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [semester, setSemester] = useState<number>(() => semesterOf(todayIn(tz)));
  const [month, setMonth] = useState(0);
  const [tab, setTab] = useState('class');

  // Teachers only assess the classes they are homeroom teacher of; the office sees every class.
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
        title="Rèn luyện"
        extra={
          <Space wrap>
            {tab === 'class' && <Select placeholder="Chọn lớp" value={classId} onChange={setClassId} style={{ width: 280 }} options={options} showSearch optionFilterProp="label" />}
            {tab !== 'criteria' && <Select value={semester} onChange={setSemester} options={SEMESTERS} style={{ width: 120 }} />}
            {tab === 'class' && <Select value={month} onChange={setMonth} options={MONTHS} style={{ width: 130 }} />}
          </Space>
        }
      />
      {isTeacher && classes && !options.length && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Bạn chưa được phân công chủ nhiệm lớp nào nên chưa thể đánh giá rèn luyện." />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'class', label: 'Đánh giá theo lớp', children: <ClassAssessments classId={classId} semester={semester} month={month} staff={!isTeacher} /> },
          ...(!isTeacher ? [{ key: 'criteria', label: 'Tiêu chí', children: <CriteriaForm /> }] : []),
          { key: 'summary', label: 'Tổng hợp', children: <ConductSummary semester={semester} /> },
        ]}
      />
    </>
  );
}

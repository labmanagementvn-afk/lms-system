'use client';

import { Segmented, Select, Space } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { GradeSheet } from '@/components/grades/GradeSheet';
import { useClasses, useSubjects } from '@/lib/hooks';

/** Nhập điểm: the gradebook of one class, subject and semester. */
export default function GradesPage() {
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [classId, setClassId] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();
  const [semester, setSemester] = useState(1);

  const classOptions = useMemo(() => (classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` })), [classes]);
  const subjectOptions = useMemo(() => (subjects ?? []).map((s) => ({ value: s.id, label: s.name })), [subjects]);

  useEffect(() => {
    if (!classId && classOptions.length) setClassId(classOptions[0].value);
  }, [classOptions, classId]);
  useEffect(() => {
    if (!subjectId && subjectOptions.length) setSubjectId(subjectOptions[0].value);
  }, [subjectOptions, subjectId]);

  return (
    <>
      <PageHeader
        title="Nhập điểm"
        extra={
          <Space wrap>
            <Select placeholder="Chọn lớp" value={classId} onChange={setClassId} style={{ width: 160 }} options={classOptions} showSearch optionFilterProp="label" />
            <Select placeholder="Chọn môn" value={subjectId} onChange={setSubjectId} style={{ width: 220 }} options={subjectOptions} showSearch optionFilterProp="label" />
            <Segmented
              value={semester}
              onChange={(v) => setSemester(Number(v))}
              options={[
                { value: 1, label: 'Học kỳ 1' },
                { value: 2, label: 'Học kỳ 2' },
              ]}
            />
          </Space>
        }
      />
      <GradeSheet classId={classId} subjectId={subjectId} semester={semester} />
    </>
  );
}

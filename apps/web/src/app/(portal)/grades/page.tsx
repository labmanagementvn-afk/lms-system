'use client';

import { Segmented, Select, Space } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { GradeSheet } from '@/components/grades/GradeSheet';
import { useAuth } from '@/lib/auth';
import { useClasses, useSubjects } from '@/lib/hooks';
import { AssignmentList, byClassName } from '@/lib/teaching';

/** Nhập điểm: the gradebook of one class, subject and semester. */
export default function GradesPage() {
  const { me } = useAuth();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [classId, setClassId] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();
  const [semester, setSemester] = useState(1);
  // A teacher's own classes and subjects this semester (phân công giảng dạy), to jump straight to them.
  const teacherId = me?.role === 'TEACHER' ? me.teacherId : null;
  const { data: mine } = useSWR<AssignmentList>(teacherId ? ['/teaching/assignments', { semester, teacherId }] : null);
  const pairs = useMemo(() => [...(mine?.items ?? [])].sort((a, b) => byClassName(a.class, b.class) || a.subject.name.localeCompare(b.subject.name, 'vi')), [mine]);
  const opened = useRef(false);

  const classOptions = useMemo(() => (classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` })), [classes]);
  const subjectOptions = useMemo(() => (subjects ?? []).map((s) => ({ value: s.id, label: s.name })), [subjects]);

  useEffect(() => {
    // A teacher opens on their first assigned class and subject.
    if (!opened.current && pairs.length) {
      opened.current = true;
      setClassId(pairs[0].class.id);
      setSubjectId(pairs[0].subject.id);
    }
  }, [pairs]);
  // With no assignment to open on (the office, or a teacher with none this semester), the first class and subject.
  // Waiting for the teacher's list keeps these from overriding the jump above when both land in one render.
  const fallback = !teacherId || (!!mine && !pairs.length);
  useEffect(() => {
    if (!classId && classOptions.length && fallback) setClassId(classOptions[0].value);
  }, [classOptions, classId, fallback]);
  useEffect(() => {
    if (!subjectId && subjectOptions.length && fallback) setSubjectId(subjectOptions[0].value);
  }, [subjectOptions, subjectId, fallback]);

  const pairKey = pairs.find((p) => p.class.id === classId && p.subject.id === subjectId)?.id;

  return (
    <>
      <PageHeader
        title="Nhập điểm"
        extra={
          <Space wrap>
            {teacherId && (
              <Select
                placeholder={pairs.length ? 'Lớp, môn được phân công' : 'Chưa được phân công'}
                value={pairKey}
                onChange={(id) => {
                  const p = pairs.find((x) => x.id === id);
                  if (p) {
                    setClassId(p.class.id);
                    setSubjectId(p.subject.id);
                  }
                }}
                style={{ width: 240 }}
                options={pairs.map((p) => ({ value: p.id, label: `${p.subject.name} · Lớp ${p.class.name}` }))}
                disabled={!pairs.length}
              />
            )}
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

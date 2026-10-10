'use client';

import { Segmented, Spin, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { MarksList, SubjectMarks, TermResult } from '@/components/grades/SubjectMarksCard';
import { SEMESTER } from '@/lib/labels';
import { useStudent } from '@/lib/student';

interface Grades {
  class: { id: string; name: string } | null;
  semester: number;
  subjects: SubjectMarks[];
  term: TermResult | null;
  /** The school shows marks only after the class gradebook is locked. */
  hidden?: boolean;
}

/** Điểm số: the signed-in student's marks per semester and for the year. */
export default function StudentGradesPage() {
  const { student, loading } = useStudent();
  const [semester, setSemester] = useState(1);
  const { data, isLoading } = useSWR<Grades>(['/student/grades', { semester }]);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text strong>
          Điểm số{student?.class ? ` · Lớp ${student.class.name}` : ''}
        </Typography.Text>
        <Segmented value={semester} onChange={(v) => setSemester(Number(v))} options={[1, 2, 0].map((s) => ({ value: s, label: SEMESTER[s] }))} />
      </div>
      {isLoading && !data ? <Spin style={{ display: 'block', margin: '48px auto' }} /> : <MarksList data={data} year={semester === 0} loading={isLoading} />}
    </div>
  );
}

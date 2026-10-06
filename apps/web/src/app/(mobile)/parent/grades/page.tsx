'use client';

import { Empty, Segmented, Spin, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { MarksList, SubjectMarks, TermResult } from '@/components/grades/SubjectMarksCard';
import { SEMESTER } from '@/lib/labels';
import { useParent } from '@/lib/parent';

interface Grades {
  class: { id: string; name: string } | null;
  semester: number;
  subjects: SubjectMarks[];
  term: TermResult | null;
}

/** Sổ điểm & kết quả học tập of the selected child. */
export default function ParentGradesPage() {
  const { child, loading } = useParent();
  const [semester, setSemester] = useState(1);
  const { data, isLoading } = useSWR<Grades>(child ? [`/parent/children/${child.id}/grades`, { semester }] : null);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text strong>
          Điểm số · {child.fullName}
          {child.class ? ` (${child.class.name})` : ''}
        </Typography.Text>
        <Segmented value={semester} onChange={(v) => setSemester(Number(v))} options={[1, 2, 0].map((s) => ({ value: s, label: SEMESTER[s] }))} />
      </div>
      {isLoading && !data ? <Spin style={{ display: 'block', margin: '48px auto' }} /> : <MarksList data={data} year={semester === 0} loading={isLoading} />}
    </div>
  );
}

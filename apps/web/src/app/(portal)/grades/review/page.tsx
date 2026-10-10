'use client';

import { Select, Space, Tabs } from 'antd';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PromotionTab } from '@/components/grades/review/PromotionTab';
import { RetakesTab } from '@/components/grades/review/RetakesTab';
import { TrainingTab } from '@/components/grades/review/TrainingTab';
import { Scope, slug } from '@/components/grades/review/types';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';

/**
 * Xét lên lớp sau hè (Điều 12 to 14 Thông tư 22/2021): retakes for learning at
 * Chưa đạt, summer training for conduct at Chưa đạt, and the promotion that
 * follows. Teachers enter retake results for their subjects and homeroom
 * teachers run summer training; the office registers retakes.
 */
export default function ReviewPage() {
  const { me } = useAuth();
  const office = me?.role === 'ADMIN' || me?.role === 'STAFF';
  const { data: classes } = useClasses();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [classId, setClassId] = useState<string>();
  const gradeLevels = useMemo(() => [...new Set((classes ?? []).map((c) => c.gradeLevel as number))].sort((a, b) => a - b), [classes]);
  const klass = classes?.find((c) => c.id === classId);

  const scope: Scope = { gradeLevel: klass?.gradeLevel ?? gradeLevel, classId };
  const scopeName = klass ? slug(`lop-${klass.name}`) : gradeLevel ? `khoi-${gradeLevel}` : 'toan-truong';

  return (
    <>
      <PageHeader
        title="Kiểm tra lại & rèn luyện hè"
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder="Toàn trường"
              value={gradeLevel}
              onChange={(v) => {
                setGradeLevel(v);
                setClassId(undefined);
              }}
              style={{ width: 130 }}
              options={gradeLevels.map((g) => ({ value: g, label: `Khối ${g}` }))}
            />
            <Select
              allowClear
              placeholder="Tất cả các lớp"
              value={classId}
              onChange={setClassId}
              style={{ width: 160 }}
              showSearch
              optionFilterProp="label"
              options={(classes ?? []).filter((c) => !gradeLevel || c.gradeLevel === gradeLevel).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))}
            />
          </Space>
        }
      />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'retakes', label: 'Kiểm tra lại', children: <RetakesTab scope={scope} scopeName={scopeName} office={office} /> },
          { key: 'training', label: 'Rèn luyện trong hè', children: <TrainingTab scope={scope} scopeName={scopeName} office={office} /> },
          { key: 'promotion', label: 'Kết quả xét lên lớp', children: <PromotionTab scope={scope} scopeName={scopeName} /> },
        ]}
      />
    </>
  );
}

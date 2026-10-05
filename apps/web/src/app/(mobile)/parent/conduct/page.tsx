'use client';

import { Card, Empty, List, Segmented, Spin, Statistic, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { AssessmentItemsTable } from '@/components/conduct/AssessmentItemsTable';
import { ConductLevelTag, ConductStatusTag } from '@/components/conduct/ConductLevelTag';
import { OwnConduct, roundLabel, semesterOf } from '@/components/conduct/types';
import { useAuth } from '@/lib/auth';
import { useParent } from '@/lib/parent';
import { todayIn } from '@/lib/time';

/** Read-only conduct result of the selected child: status, totals, level, points per criterion and comments. */
export default function ParentConductPage() {
  const tz = useAuth().me!.school.timezone;
  const { child, loading } = useParent();
  const [semester, setSemester] = useState<number>(() => semesterOf(todayIn(tz)));
  const { data, isLoading } = useSWR<OwnConduct>(child ? [`/parent/children/${child.id}/conduct`, { semester, month: 0 }] : null);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  const a = data?.assessment ?? null;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Typography.Text strong ellipsis>
          Rèn luyện · {child.fullName}
        </Typography.Text>
        <Segmented value={semester} onChange={(v) => setSemester(Number(v))} options={[{ value: 1, label: 'Học kỳ 1' }, { value: 2, label: 'Học kỳ 2' }]} />
      </div>

      {isLoading && <Spin style={{ display: 'block', margin: '24px auto' }} />}
      {data && !a && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Chưa có đánh giá rèn luyện học kỳ ${semester}`} style={{ marginTop: 24 }} />}

      {a && (
        <>
          <Card size="small">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>
                <ConductStatusTag status={a.status} />{' '}
                <Typography.Text type="secondary">
                  {roundLabel(a.semester, a.month)}
                  {data?.academicYear ? ` · ${data.academicYear.name}` : ''}
                </Typography.Text>
              </span>
              {a.status === 'APPROVED' && <ConductLevelTag level={a.level} size="large" />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
              <Statistic title="Con tự chấm" value={a.selfTotal ?? '—'} valueStyle={{ fontSize: 20 }} />
              <Statistic title="GVCN chấm" value={a.teacherTotal ?? '—'} valueStyle={{ fontSize: 20, color: '#1d4ed8' }} />
              <Statistic title="Kết quả" value={a.finalTotal ?? '—'} valueStyle={{ fontSize: 20, color: '#16a34a' }} />
            </div>
            {a.status !== 'APPROVED' && (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                Kết quả chính thức sẽ hiển thị sau khi nhà trường duyệt.
              </Typography.Text>
            )}
          </Card>

          <Card size="small" title="Chi tiết theo tiêu chí" styles={{ body: { padding: 0 } }}>
            <AssessmentItemsTable items={a.items} compact />
            {(a.selfComment || a.teacherComment) && (
              <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                {a.selfComment && (
                  <div>
                    <Typography.Text type="secondary">Con tự nhận xét:</Typography.Text> {a.selfComment}
                  </div>
                )}
                {a.teacherComment && (
                  <div>
                    <Typography.Text type="secondary">GVCN nhận xét:</Typography.Text> {a.teacherComment}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {data?.history && data.history.length > 0 && (
        <Card size="small" title="Các đợt đánh giá" styles={{ body: { padding: '0 12px' } }}>
          <List
            dataSource={data.history}
            renderItem={(h) => (
              <List.Item style={{ padding: '8px 0' }} extra={<ConductLevelTag level={h.level} />}>
                <List.Item.Meta
                  title={
                    <span>
                      {roundLabel(h.semester, h.month)} · {h.academicYear.name} <ConductStatusTag status={h.status} />
                    </span>
                  }
                  description={`Lớp ${h.class.name} · tự chấm ${h.selfTotal ?? '—'} · GVCN ${h.teacherTotal ?? '—'}${h.finalTotal != null ? ` · kết quả ${h.finalTotal}` : ''}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}

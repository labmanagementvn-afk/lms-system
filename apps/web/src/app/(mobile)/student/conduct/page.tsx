'use client';

import { SendOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Input, InputNumber, List, Segmented, Spin, Statistic, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AssessmentItemsTable } from '@/components/conduct/AssessmentItemsTable';
import { ConductLevelTag, ConductStatusTag } from '@/components/conduct/ConductLevelTag';
import { Criterion, groupBy, HistoryRow, OwnConduct, roundLabel, semesterOf, totalOf } from '@/components/conduct/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStudent } from '@/lib/student';
import { todayIn } from '@/lib/time';

type Draft = { points: number | null; note: string };

/** The student's self-assessment for the semester, the teacher's review once it exists, and past rounds. */
export default function StudentConductPage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { student, loading } = useStudent();
  const [semester, setSemester] = useState<number>(() => semesterOf(todayIn(tz)));
  const { data, isLoading, mutate } = useSWR<OwnConduct>(student?.class ? ['/student/conduct', { semester, month: 0 }] : null);
  const { data: history, mutate: refreshHistory } = useSWR<HistoryRow[]>(student ? ['/student/conduct/history'] : null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const a = data?.assessment ?? null;
  const editable = !!a && (a.status === 'DRAFT' || a.status === 'SELF_ASSESSED');
  const criteria: Criterion[] = useMemo(() => data?.criteria ?? [], [data]);
  const groups = useMemo(() => groupBy(criteria, (c) => c.groupName, (c) => c.sortOrder), [criteria]);

  useEffect(() => {
    if (!a) return;
    const byId = new Map(a.items.map((i) => [i.criterionId, i]));
    setDraft(Object.fromEntries(criteria.map((c) => [c.id, { points: byId.get(c.id)?.selfPoints ?? null, note: byId.get(c.id)?.note ?? '' }])));
    setComment(a.selfComment ?? '');
  }, [a, criteria]);

  const liveTotal = totalOf(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.points])), criteria);
  const filled = criteria.every((c) => draft[c.id]?.points != null);
  const update = (id: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { points: null, note: '' }), ...patch } }));

  async function submit() {
    setSending(true);
    try {
      const items = criteria.map((c) => ({ criterionId: c.id, selfPoints: draft[c.id]?.points ?? 0, note: draft[c.id]?.note?.trim() || undefined }));
      const res = await api('/student/conduct/self', { method: 'PUT', body: { semester, month: 0, items, selfComment: comment.trim() } });
      await mutate(res, { revalidate: false });
      await refreshHistory();
      message.success(`Đã gửi tự đánh giá: ${res.assessment.selfTotal} điểm`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!student?.class) return <Empty description="Em chưa được xếp lớp nên chưa có phiếu rèn luyện" style={{ marginTop: 48 }} />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Typography.Text strong>Rèn luyện · lớp {student.class.name}</Typography.Text>
        <Segmented value={semester} onChange={(v) => setSemester(Number(v))} options={[{ value: 1, label: 'Học kỳ 1' }, { value: 2, label: 'Học kỳ 2' }]} />
      </div>

      {isLoading && <Spin style={{ display: 'block', margin: '24px auto' }} />}

      {a && (
        <Card size="small">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <ConductStatusTag status={a.status} />
            {a.status === 'APPROVED' && <ConductLevelTag level={a.level} size="large" />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            <Statistic title="Em tự chấm" value={editable ? liveTotal : (a.selfTotal ?? '—')} suffix="/ 100" valueStyle={{ fontSize: 20 }} />
            <Statistic title="GVCN chấm" value={a.teacherTotal ?? '—'} suffix={a.teacherTotal != null ? '/ 100' : undefined} valueStyle={{ fontSize: 20, color: '#1d4ed8' }} />
            <Statistic title="Kết quả" value={a.finalTotal ?? '—'} valueStyle={{ fontSize: 20, color: '#16a34a' }} />
          </div>
          {a.status === 'SELF_ASSESSED' && <Alert type="info" showIcon style={{ marginTop: 12 }} message="Đã gửi tự đánh giá. Em vẫn có thể sửa cho đến khi giáo viên chủ nhiệm đánh giá." />}
          {a.status === 'REVIEWED' && <Alert type="warning" showIcon style={{ marginTop: 12 }} message="Giáo viên chủ nhiệm đã đánh giá, đang chờ nhà trường duyệt." />}
        </Card>
      )}

      {a && editable && (
        <Card size="small" title="Phiếu tự đánh giá">
          <div style={{ display: 'grid', gap: 12 }}>
            {groups.map((g) => (
              <div key={g.name}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                  {g.name} ({g.rows.reduce((s, c) => s + c.maxPoints, 0)} điểm)
                </Typography.Text>
                {g.rows.map((c) => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <div>{c.name}</div>
                      <Input
                        size="small"
                        placeholder="Ghi chú (nếu có)"
                        maxLength={500}
                        value={draft[c.id]?.note ?? ''}
                        onChange={(e) => update(c.id, { note: e.target.value })}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                    <InputNumber
                      min={0}
                      max={c.maxPoints}
                      precision={0}
                      value={draft[c.id]?.points ?? undefined}
                      onChange={(v) => update(c.id, { points: v == null ? null : Number(v) })}
                      addonAfter={`/ ${c.maxPoints}`}
                      style={{ width: 120 }}
                    />
                  </div>
                ))}
              </div>
            ))}
            <div>
              <Typography.Text strong>Em tự nhận xét</Typography.Text>
              <Input.TextArea rows={3} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="Ưu điểm, hạn chế và hướng phấn đấu của em" style={{ marginTop: 6 }} />
            </div>
            <Button type="primary" size="large" block icon={<SendOutlined />} onClick={submit} loading={sending} disabled={!filled}>
              Gửi tự đánh giá ({liveTotal} điểm)
            </Button>
            {!filled && <Typography.Text type="secondary">Chấm đủ mọi tiêu chí để gửi.</Typography.Text>}
          </div>
        </Card>
      )}

      {a && !editable && (
        <Card size="small" title="Chi tiết đánh giá" styles={{ body: { padding: 0 } }}>
          <AssessmentItemsTable items={a.items} compact />
          {(a.selfComment || a.teacherComment) && (
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              {a.selfComment && (
                <div>
                  <Typography.Text type="secondary">Em tự nhận xét:</Typography.Text> {a.selfComment}
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
      )}

      <Card size="small" title="Các đợt đánh giá" styles={{ body: { padding: '0 12px' } }}>
        <List
          dataSource={history ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đợt đánh giá nào" /> }}
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
    </div>
  );
}

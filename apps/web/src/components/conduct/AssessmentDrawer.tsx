'use client';

import { SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Input, InputNumber, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ConductLevelTag, ConductStatusTag } from './ConductLevelTag';
import { Assessment, AssessmentItem, groupBy, NO_GROUP, roundLabel, totalOf } from './types';

type Draft = { teacherPoints: number | null; note: string };
type Row = { key: string; kind: 'group'; name: string; max: number; self: number } | ({ key: string; kind: 'item' } & AssessmentItem);

/** The homeroom teacher's review of one student: self points read-only, teacher points per criterion, comment, save. */
export function AssessmentDrawer({ assessmentId, onClose, onSaved }: { assessmentId: string | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<Assessment>(assessmentId ? [`/conduct/assessments/${assessmentId}`] : null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.items.map((i) => [i.criterionId, { teacherPoints: i.teacherPoints, note: i.note ?? '' }])));
    setComment(data.teacherComment ?? '');
  }, [data]);

  // Only active criteria are scored; inactive ones with old points stay visible but locked.
  const active = useMemo(() => (data?.items ?? []).filter((i) => i.criterion.isActive).map((i) => i.criterion), [data]);
  const readOnly = data?.status === 'APPROVED';
  const liveTotal = totalOf(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.teacherPoints])), active);
  const filled = active.every((c) => draft[c.id]?.teacherPoints != null);

  const rows: Row[] = [];
  if (data) {
    for (const g of groupBy(data.items, (i) => i.criterion.groupName, (i) => i.criterion.sortOrder)) {
      rows.push({
        key: `g:${g.name}`,
        kind: 'group',
        name: g.name,
        max: g.rows.reduce((s, i) => s + i.criterion.maxPoints, 0),
        self: g.rows.reduce((s, i) => s + Math.min(i.selfPoints ?? 0, i.criterion.maxPoints), 0),
      });
      for (const i of g.rows) rows.push({ key: i.criterionId, kind: 'item', ...i });
    }
  }

  const update = (id: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { teacherPoints: null, note: '' }), ...patch } }));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const items = active.map((c) => ({ criterionId: c.id, teacherPoints: draft[c.id]?.teacherPoints ?? 0, note: draft[c.id]?.note?.trim() || undefined }));
      const res = await api(`/conduct/assessments/${data.id}/review`, { method: 'PUT', body: { items, teacherComment: comment.trim() } });
      await mutate(res, { revalidate: false });
      message.success(`Đã lưu đánh giá: ${res.teacherTotal} điểm`);
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<Row> = [
    {
      title: 'Tiêu chí',
      render: (_, r) =>
        r.kind === 'group' ? (
          <Typography.Text strong>{r.name}</Typography.Text>
        ) : (
          <span>
            {r.criterion.name}
            {!r.criterion.isActive && <Tag style={{ marginLeft: 6 }}>Ngừng áp dụng</Tag>}
          </span>
        ),
    },
    { title: 'Tối đa', width: 70, align: 'center', render: (_, r) => (r.kind === 'group' ? <b>{r.max}</b> : r.criterion.maxPoints) },
    { title: 'HS tự chấm', width: 90, align: 'center', render: (_, r) => (r.kind === 'group' ? <b>{r.self}</b> : (r.selfPoints ?? <span style={{ color: '#9ca3af' }}>—</span>)) },
    {
      title: 'GVCN chấm',
      width: 110,
      align: 'center',
      render: (_, r) => {
        if (r.kind === 'group') {
          const pts = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.teacherPoints]));
          const crit = data!.items.filter((i) => (i.criterion.groupName || NO_GROUP) === r.name && i.criterion.isActive).map((i) => i.criterion);
          return <b>{totalOf(pts, crit)}</b>;
        }
        return (
          <InputNumber
            size="small"
            min={0}
            max={r.criterion.maxPoints}
            precision={0}
            value={draft[r.criterionId]?.teacherPoints ?? undefined}
            disabled={readOnly || !r.criterion.isActive}
            onChange={(v) => update(r.criterionId, { teacherPoints: v == null ? null : Number(v) })}
            style={{ width: 70 }}
          />
        );
      },
    },
    {
      title: 'Ghi chú',
      render: (_, r) =>
        r.kind === 'group' ? null : (
          <Input
            size="small"
            value={draft[r.criterionId]?.note ?? ''}
            placeholder="Nhận xét cho tiêu chí"
            maxLength={500}
            disabled={readOnly}
            onChange={(e) => update(r.criterionId, { note: e.target.value })}
          />
        ),
    },
  ];

  return (
    <Drawer
      open={!!assessmentId}
      onClose={onClose}
      width={820}
      title={data ? `Đánh giá rèn luyện · ${data.student.fullName} (${data.class.name})` : 'Đánh giá rèn luyện'}
      extra={
        !readOnly && (
          <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!data || !filled}>
            Lưu đánh giá
          </Button>
        )
      }
    >
      {isLoading || !data ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {readOnly && <Alert type="success" showIcon message="Phiếu đã được duyệt. Ban giám hiệu cần mở lại trước khi sửa điểm." />}
          <Descriptions size="small" column={4} bordered>
            <Descriptions.Item label="Đợt">{roundLabel(data.semester, data.month)}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <ConductStatusTag status={data.status} />
            </Descriptions.Item>
            <Descriptions.Item label="HS tự chấm">{data.selfTotal ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="GVCN chấm">
              <b>{liveTotal}</b> / 100
            </Descriptions.Item>
            {data.status === 'APPROVED' && (
              <>
                <Descriptions.Item label="Kết quả" span={2}>
                  {data.finalTotal} điểm
                </Descriptions.Item>
                <Descriptions.Item label="Xếp loại" span={2}>
                  <ConductLevelTag level={data.level} />
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
          {data.selfComment && (
            <Alert type="info" message="Học sinh tự nhận xét" description={data.selfComment} />
          )}
          <Table<Row> rowKey="key" size="small" pagination={false} dataSource={rows} columns={columns} onRow={(r) => ({ style: r.kind === 'group' ? { background: '#f8fafc' } : undefined })} />
          <div>
            <Typography.Text strong>Nhận xét của giáo viên chủ nhiệm</Typography.Text>
            <Input.TextArea rows={3} value={comment} maxLength={2000} disabled={readOnly} onChange={(e) => setComment(e.target.value)} placeholder="Nhận xét chung về rèn luyện của học sinh" style={{ marginTop: 6 }} />
          </div>
          {!readOnly && !filled && <Typography.Text type="secondary">Chấm đủ mọi tiêu chí để lưu.</Typography.Text>}
        </Space>
      )}
    </Drawer>
  );
}

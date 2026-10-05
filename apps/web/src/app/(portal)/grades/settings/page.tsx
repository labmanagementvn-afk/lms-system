'use client';

import { SaveOutlined } from '@ant-design/icons';
import { App, Button, InputNumber, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ASSESSMENT_TYPE, options } from '@/lib/labels';

interface Row {
  subjectId: string;
  code: string;
  name: string;
  assessment: 'SCORE' | 'COMMENT';
  regularCount: number;
  periodsPerYear: number | null;
  suggestedPeriodsPerYear: number | null;
  suggestedRegularCount: number | null;
}
type Draft = { assessment: 'SCORE' | 'COMMENT'; regularCount: number; periodsPerYear: number | null };

/** Môn học & cách đánh giá: score vs comment assessment and the number of regular marks per semester. */
export default function GradeSettingsPage() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const readOnly = me?.role === 'TEACHER';
  const { data, isLoading, mutate } = useSWR<Row[]>(['/grades/settings']);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const current = (r: Row): Draft => draft[r.subjectId] ?? { assessment: r.assessment, regularCount: r.regularCount, periodsPerYear: r.periodsPerYear };
  const isDirty = (r: Row) => {
    const d = draft[r.subjectId];
    return !!d && (d.assessment !== r.assessment || d.regularCount !== r.regularCount || (d.periodsPerYear ?? null) !== (r.periodsPerYear ?? null));
  };
  const update = (r: Row, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [r.subjectId]: { ...current(r), ...patch } }));

  async function save(r: Row) {
    const d = current(r);
    setSaving(r.subjectId);
    try {
      await api(`/grades/settings/${r.subjectId}`, { method: 'PUT', body: { assessment: d.assessment, regularCount: d.regularCount, ...(d.periodsPerYear ? { periodsPerYear: d.periodsPerYear } : {}) } });
      await mutate();
      setDraft((x) => {
        const { [r.subjectId]: _, ...rest } = x;
        return rest;
      });
      message.success(`Đã lưu ${r.name}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const columns: ColumnsType<Row> = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    { title: 'Môn học', dataIndex: 'name', width: 220, render: (v: string) => <b>{v}</b> },
    {
      title: 'Cách đánh giá',
      width: 180,
      render: (_, r) => <Select value={current(r).assessment} disabled={readOnly} style={{ width: 160 }} options={options(ASSESSMENT_TYPE)} onChange={(assessment) => update(r, { assessment })} />,
    },
    {
      title: 'Số điểm thường xuyên / học kỳ',
      width: 200,
      render: (_, r) => <InputNumber min={1} max={10} value={current(r).regularCount} disabled={readOnly} style={{ width: 80 }} onChange={(v) => update(r, { regularCount: v ?? 1 })} />,
    },
    {
      title: 'Số tiết / năm',
      width: 140,
      render: (_, r) => <InputNumber min={1} max={1000} value={current(r).periodsPerYear} disabled={readOnly} style={{ width: 90 }} placeholder={r.suggestedPeriodsPerYear ? String(r.suggestedPeriodsPerYear) : ''} onChange={(v) => update(r, { periodsPerYear: v ?? null })} />,
    },
    {
      title: 'Gợi ý theo TT22',
      render: (_, r) =>
        r.suggestedRegularCount ? (
          <Typography.Text type="secondary">
            {r.suggestedRegularCount} điểm TX
            {r.suggestedPeriodsPerYear ? ` (thời khóa biểu: ${r.suggestedPeriodsPerYear} tiết/năm)` : r.periodsPerYear ? ` (${r.periodsPerYear} tiết/năm)` : ''}
            {r.suggestedRegularCount !== current(r).regularCount && <Tag color="orange" style={{ marginLeft: 8 }}>khác cài đặt</Tag>}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">Chưa có thời khóa biểu</Typography.Text>
        ),
    },
    {
      title: '',
      width: 100,
      render: (_, r) =>
        !readOnly && (
          <Button type="primary" size="small" icon={<SaveOutlined />} disabled={!isDirty(r)} loading={saving === r.subjectId} onClick={() => save(r)}>
            Lưu
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Môn học & cách đánh giá" />
      <Typography.Paragraph type="secondary">
        Theo Thông tư 22/2021: môn có ≤ 35 tiết/năm có 2 điểm thường xuyên mỗi học kỳ, ≤ 70 tiết có 3, trên 70 tiết có 4. Môn đánh giá bằng nhận xét chỉ ghi Đạt / Chưa đạt.
      </Typography.Paragraph>
      <Table<Row> rowKey="subjectId" loading={isLoading} dataSource={data ?? []} columns={columns} size="small" pagination={false} onRow={(r) => ({ style: isDirty(r) ? { background: '#fffbeb' } : undefined })} />
    </>
  );
}

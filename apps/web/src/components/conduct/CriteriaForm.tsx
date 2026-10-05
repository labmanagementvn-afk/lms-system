'use client';

import { DeleteOutlined, PlusOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, App, AutoComplete, Button, Input, InputNumber, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Criterion, groupBy, NO_GROUP } from './types';

type Row = { key: string; id?: string; code: string; name: string; maxPoints: number; groupName: string; sortOrder: number; isActive: boolean; itemCount: number };
type TableRow = { key: string; kind: 'group'; name: string; points: number } | ({ kind: 'item' } & Row);

let seq = 0;
const fromApi = (c: Criterion): Row => ({ key: c.id, id: c.id, code: c.code, name: c.name, maxPoints: c.maxPoints, groupName: c.groupName ?? '', sortOrder: c.sortOrder, isActive: c.isActive, itemCount: c.itemCount ?? 0 });

/**
 * The school's criteria as an editable table: changes stay local until "Lưu", which replaces
 * the whole list at once so points can move between criteria while the active total stays 100.
 */
export function CriteriaForm() {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<Criterion[]>(['/conduct/criteria']);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !dirty) setRows(data.map(fromApi));
  }, [data, dirty]);

  const activeTotal = rows.filter((r) => r.isActive).reduce((s, r) => s + r.maxPoints, 0);
  const groups = useMemo(() => groupBy(rows, (r) => r.groupName, (r) => r.sortOrder), [rows]);
  const groupNames = groups.map((g) => g.name).filter((n) => n !== NO_GROUP);
  const invalid = rows.some((r) => !r.code.trim() || !r.name.trim()) || new Set(rows.map((r) => r.code.trim().toUpperCase())).size !== rows.length;

  const edit = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const add = (groupName = '') => {
    const n = rows.length + 1;
    setRows((rs) => [...rs, { key: `new-${++seq}`, code: `RL${String(n).padStart(2, '0')}`, name: '', maxPoints: 0, groupName, sortOrder: n, isActive: true, itemCount: 0 }]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };
  const reset = () => {
    setRows((data ?? []).map(fromApi));
    setDirty(false);
  };

  async function save() {
    setSaving(true);
    try {
      // Rows are saved in their displayed order (by group, then by current sortOrder).
      const ordered = groups.flatMap((g) => g.rows);
      const body = ordered.map((r, i) => ({ id: r.id, code: r.code.trim().toUpperCase(), name: r.name.trim(), maxPoints: r.maxPoints, groupName: r.groupName.trim() || undefined, sortOrder: i + 1, isActive: r.isActive }));
      const res = await api('/conduct/criteria', { method: 'PUT', body: { criteria: body } });
      setDirty(false);
      await mutate(res, { revalidate: false });
      message.success('Đã lưu bộ tiêu chí');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tableRows: TableRow[] = groups.flatMap((g) => [
    { key: `g:${g.name}`, kind: 'group' as const, name: g.name, points: g.rows.filter((r) => r.isActive).reduce((s, r) => s + r.maxPoints, 0) },
    ...g.rows.map((r) => ({ kind: 'item' as const, ...r })),
  ]);

  const columns: ColumnsType<TableRow> = [
    {
      title: 'Mã',
      width: 110,
      render: (_, r) => (r.kind === 'group' ? <Typography.Text strong>{r.name}</Typography.Text> : <Input size="small" value={r.code} maxLength={20} onChange={(e) => edit(r.key, { code: e.target.value })} />),
      onCell: (r) => ({ colSpan: r.kind === 'group' ? 3 : 1 }),
    },
    {
      title: 'Tiêu chí',
      render: (_, r) => (r.kind === 'group' ? null : <Input size="small" value={r.name} maxLength={200} placeholder="Tên tiêu chí" onChange={(e) => edit(r.key, { name: e.target.value })} />),
      onCell: (r) => ({ colSpan: r.kind === 'group' ? 0 : 1 }),
    },
    {
      title: 'Nhóm',
      width: 200,
      render: (_, r) =>
        r.kind === 'group' ? null : (
          <AutoComplete size="small" value={r.groupName} options={groupNames.map((n) => ({ value: n }))} onChange={(v) => edit(r.key, { groupName: v })} placeholder="Nhóm tiêu chí" style={{ width: '100%' }} />
        ),
      onCell: (r) => ({ colSpan: r.kind === 'group' ? 0 : 1 }),
    },
    {
      title: 'Điểm tối đa',
      width: 110,
      align: 'center',
      render: (_, r) => (r.kind === 'group' ? <b>{r.points}</b> : <InputNumber size="small" min={0} max={100} precision={0} value={r.maxPoints} onChange={(v) => edit(r.key, { maxPoints: Number(v ?? 0) })} style={{ width: 80 }} />),
    },
    {
      title: 'Áp dụng',
      width: 90,
      align: 'center',
      render: (_, r) => (r.kind === 'group' ? null : <Switch size="small" checked={r.isActive} onChange={(v) => edit(r.key, { isActive: v })} />),
    },
    {
      title: 'Đã chấm',
      width: 90,
      align: 'center',
      render: (_, r) => (r.kind === 'group' ? null : r.itemCount ? <Tag>{r.itemCount}</Tag> : <span style={{ color: '#9ca3af' }}>0</span>),
    },
    {
      title: '',
      width: 60,
      render: (_, r) =>
        r.kind === 'group' ? (
          <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => add(r.name === NO_GROUP ? '' : r.name)} />
        ) : r.itemCount ? (
          <Popconfirm title="Tiêu chí đã có điểm; xóa sẽ chỉ ngừng áp dụng. Tiếp tục?" okText="Ngừng áp dụng" cancelText="Hủy" onConfirm={() => remove(r.key)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : (
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(r.key)} />
        ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color={activeTotal === 100 ? 'green' : 'red'} style={{ fontSize: 14, padding: '2px 10px' }}>
          Tổng điểm áp dụng: {activeTotal} / 100
        </Tag>
        <Button icon={<PlusOutlined />} onClick={() => add()}>
          Thêm tiêu chí
        </Button>
        <Button icon={<UndoOutlined />} onClick={reset} disabled={!dirty}>
          Hoàn tác
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!dirty || activeTotal !== 100 || invalid}>
          Lưu
        </Button>
        {dirty && <Tag color="gold">Thay đổi chưa lưu</Tag>}
      </Space>
      {activeTotal !== 100 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Tổng điểm các tiêu chí đang áp dụng phải bằng 100 (hiện là ${activeTotal}).`} />}
      {invalid && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Mỗi tiêu chí cần có mã (không trùng) và tên." />}
      <Table<TableRow>
        rowKey="key"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={tableRows}
        columns={columns}
        onRow={(r) => ({ style: r.kind === 'group' ? { background: '#f8fafc' } : undefined })}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Điểm rèn luyện = tổng điểm các tiêu chí đang áp dụng (100 điểm). Xếp loại: Tốt ≥ 90, Khá ≥ 70, Đạt ≥ 50, còn lại Chưa đạt.
      </Typography.Paragraph>
    </>
  );
}

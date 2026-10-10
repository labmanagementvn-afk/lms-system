'use client';

import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, App, Button, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';

interface HomeroomData {
  academicYear: { id: string; name: string };
  maxConcurrent: number;
  classes: { id: string; name: string; gradeLevel: number; room: string | null; students: number; homeroomTeacher: { id: string; code: string; fullName: string } | null }[];
  teachers: { id: string; code: string; fullName: string; subjectGroup: string | null; homeroomClasses: string[]; duties: string[] }[];
}

/**
 * Phân công chủ nhiệm: the homeroom teacher of each class. A homeroom class counts as one
 * of the two duties a teacher may hold at once (Điều 3, Thông tư 05/2025/TT-BGDĐT).
 */
export default function HomeroomAssignmentPage() {
  const { me } = useAuth();
  const admin = canManage(me);
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<HomeroomData>(['/teaching/homeroom']);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.classes.map((c) => [c.id, c.homeroomTeacher?.id ?? null])));
  }, [data]);

  const changed = useMemo(() => (data?.classes ?? []).filter((c) => (c.homeroomTeacher?.id ?? null) !== (draft[c.id] ?? null)), [data, draft]);
  const teacher = useMemo(() => new Map((data?.teachers ?? []).map((t) => [t.id, t])), [data]);
  /** Classes each teacher would be homeroom teacher of once the draft is saved. */
  const classesOf = (teacherId: string) => (data?.classes ?? []).filter((c) => draft[c.id] === teacherId).map((c) => c.name);

  /** What a teacher would hold: their homeroom classes and duties, and whether that is over the limit. */
  const load = (teacherId: string) => {
    const t = teacher.get(teacherId);
    const classes = classesOf(teacherId);
    const count = classes.length + (t?.duties.length ?? 0);
    return { classes, duties: t?.duties ?? [], count, over: count > (data?.maxConcurrent ?? 2) };
  };

  async function save() {
    setSaving(true);
    try {
      await api('/teaching/homeroom', { method: 'PUT', body: { items: changed.map((c) => ({ classId: c.id, teacherId: draft[c.id] ?? null })) } });
      message.success(`Đã lưu phân công chủ nhiệm ${changed.length} lớp`);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const missing = (data?.classes ?? []).filter((c) => !draft[c.id]).length;
  const options = (data?.teachers ?? []).map((t) => {
    const l = load(t.id);
    const holds = [...l.classes.map((c) => `CN ${c}`), ...l.duties];
    return { value: t.id, label: `${t.fullName} (${t.code})`, holds: holds.join('; ') };
  });

  return (
    <>
      <PageHeader
        title="Phân công chủ nhiệm"
        extra={
          admin && (
            <Space>
              <Button icon={<UndoOutlined />} disabled={!changed.length} onClick={() => data && setDraft(Object.fromEntries(data.classes.map((c) => [c.id, c.homeroomTeacher?.id ?? null])))}>
                Hoàn tác
              </Button>
              <Button type="primary" icon={<SaveOutlined />} disabled={!changed.length} loading={saving} onClick={save}>
                Lưu{changed.length ? ` (${changed.length} lớp)` : ''}
              </Button>
            </Space>
          )
        }
      />
      {data && (
        <Alert
          type={missing ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 12 }}
          message={`Năm học ${data.academicYear.name}: ${data.classes.length - missing}/${data.classes.length} lớp đã có giáo viên chủ nhiệm.`}
          description={`Mỗi giáo viên kiêm nhiệm không quá ${data.maxConcurrent} nhiệm vụ, kể cả chủ nhiệm lớp (Điều 3 Thông tư 05/2025/TT-BGDĐT). Giáo viên chủ nhiệm được giảm định mức tiết dạy và ghi sổ chủ nhiệm của lớp.`}
        />
      )}
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.classes}
        pagination={false}
        columns={[
          { title: 'Lớp', dataIndex: 'name', width: 80 },
          { title: 'Khối', dataIndex: 'gradeLevel', width: 70, align: 'center' },
          { title: 'Sĩ số', dataIndex: 'students', width: 70, align: 'center' },
          { title: 'Phòng học', dataIndex: 'room', width: 100 },
          {
            title: 'Giáo viên chủ nhiệm',
            width: 320,
            render: (_, c) =>
              admin ? (
                <Select
                  allowClear
                  showSearch
                  placeholder="Chưa phân công"
                  style={{ width: 300 }}
                  value={draft[c.id] ?? undefined}
                  onChange={(v) => setDraft({ ...draft, [c.id]: v ?? null })}
                  optionFilterProp="label"
                  options={options}
                  optionRender={(o) => (
                    <div>
                      {o.data.label}
                      {o.data.holds && (
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                          {o.data.holds}
                        </Typography.Text>
                      )}
                    </div>
                  )}
                />
              ) : (
                (c.homeroomTeacher?.fullName ?? <Tag>Chưa phân công</Tag>)
              ),
          },
          {
            title: 'Nhiệm vụ của giáo viên',
            render: (_, c) => {
              const id = draft[c.id];
              if (!id) return null;
              const l = load(id);
              return (
                <Space size={4} wrap>
                  {l.classes.map((n) => (
                    <Tag key={n} color={n === c.name ? 'blue' : 'default'}>
                      Chủ nhiệm {n}
                    </Tag>
                  ))}
                  {l.duties.map((d) => (
                    <Tag key={d}>{d}</Tag>
                  ))}
                  {l.over && (
                    <Tooltip title={`Quá ${data?.maxConcurrent} nhiệm vụ kiêm nhiệm (Điều 3 Thông tư 05/2025/TT-BGDĐT)`}>
                      <Tag color="red">Kiêm nhiệm {l.count} nhiệm vụ</Tag>
                    </Tooltip>
                  )}
                </Space>
              );
            },
          },
        ]}
      />
    </>
  );
}

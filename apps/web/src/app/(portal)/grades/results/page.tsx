'use client';

import { DownloadOutlined, EditOutlined, FileTextOutlined, LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadCsv } from '@/components/grades/download';
import { OutcomeCell, PromotionTag, ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { options, PROMOTION_STATUS, RESULT_LEVEL, SEMESTER } from '@/lib/labels';

interface SubjectCol {
  subjectId: string;
  code: string;
  name: string;
  assessment: 'SCORE' | 'COMMENT';
}
interface Row {
  id: string;
  code: string;
  fullName: string;
  subjects: (SubjectCol & { average: number | null; passed: boolean | null })[];
  academic: string | null;
  conduct: string | null;
  title: string | null;
  promotion: string | null;
  absentDays: number;
  homeroomComment: string | null;
}
interface Results {
  class: { id: string; name: string; gradeLevel: number; homeroomTeacherId: string | null };
  semester: number;
  locked: boolean;
  subjects: SubjectCol[];
  students: Row[];
  summary: {
    academic: Record<string, number>;
    conduct: Record<string, number>;
    titles: Record<string, number>;
    promotion: Record<string, number>;
  };
}

const LEVELS = ['TOT', 'KHA', 'DAT', 'CHUA_DAT'];

/** Counts per level as a row of tags. */
function LevelCounts({ label, counts }: { label: string; counts: Record<string, number> }) {
  return (
    <Space size={4} wrap>
      <Typography.Text strong>{label}:</Typography.Text>
      {LEVELS.map((l) => (
        <Tag key={l} color={RESULT_LEVEL[l].color} style={{ margin: 0 }}>
          {RESULT_LEVEL[l].label} {counts[l] ?? 0}
        </Tag>
      ))}
      <Tag style={{ margin: 0 }}>Chưa xếp {counts.pending ?? 0}</Tag>
    </Space>
  );
}

/** Kết quả học tập: subject averages and term outcomes of a class. */
export default function ResultsPage() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [semester, setSemester] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { data, isLoading, mutate } = useSWR<Results>(classId ? ['/grades/results', { classId, semester }] : null);

  const classOptions = useMemo(() => (classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` })), [classes]);
  useEffect(() => {
    if (!classId && classOptions.length) setClassId(classOptions[0].value);
  }, [classOptions, classId]);

  const year = semester === 0;
  const isAdmin = me?.role === 'ADMIN';
  const canEdit = !!data && (me?.role !== 'TEACHER' || data.class.homeroomTeacherId === me?.teacherId);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) message.success(done);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const recompute = () => run('recompute', async () => mutate(await api('/grades/results/recompute', { method: 'POST', body: { classId, semester } }), { revalidate: false }), 'Đã tính lại kết quả');
  const toggleLock = () =>
    run(
      'lock',
      async () => {
        await api('/grades/lock', { method: data?.locked ? 'DELETE' : 'POST', body: { classId, semester } });
        await mutate();
      },
      data?.locked ? 'Đã mở khóa sổ điểm' : 'Đã khóa sổ điểm',
    );
  const exportCsv = () => run('export', () => downloadCsv('/grades/results/export', { classId, semester }, `ket-qua-${data?.class.name}-${year ? 'CN' : `HK${semester}`}.csv`));

  function openEdit(row: Row) {
    setEditing(row);
    form.setFieldsValue({ absentDays: row.absentDays, homeroomComment: row.homeroomComment ?? '', promotion: row.promotion ?? undefined });
  }
  async function submitEdit() {
    const v = await form.validateFields();
    if (!editing) return;
    await run(
      'edit',
      async () => {
        await api(`/grades/results/${editing.id}`, {
          method: 'PUT',
          body: { semester, absentDays: v.absentDays ?? 0, homeroomComment: v.homeroomComment?.trim() || null, ...(year && v.promotion ? { promotion: v.promotion } : {}) },
        });
        await mutate();
        setEditing(null);
      },
      'Đã lưu',
    );
  }

  const columns: ColumnsType<Row> = [
    { title: '#', width: 44, fixed: 'left', render: (_, __, i) => i + 1 },
    { title: 'Họ và tên', dataIndex: 'fullName', width: 190, fixed: 'left', render: (v: string, r) => <Link href={`/grades/transcript/${r.id}`}>{v}</Link> },
    ...(data?.subjects ?? []).map<ColumnsType<Row>[number]>((s, i) => ({
      title: <Tooltip title={s.name}>{s.code}</Tooltip>,
      width: 72,
      align: 'center',
      render: (_, r) => <OutcomeCell assessment={s.assessment} average={r.subjects[i]?.average ?? null} passed={r.subjects[i]?.passed ?? null} />,
    })),
    { title: 'Học tập', width: 96, align: 'center', render: (_, r) => <ResultLevelTag level={r.academic} /> },
    { title: 'Rèn luyện', width: 96, align: 'center', render: (_, r) => <ResultLevelTag level={r.conduct} /> },
    ...(year
      ? ([
          { title: 'Danh hiệu', width: 150, render: (_, r) => r.title ?? <Typography.Text type="secondary">—</Typography.Text> },
          { title: 'Lên lớp', width: 120, align: 'center', render: (_, r) => <PromotionTag status={r.promotion} /> },
        ] as ColumnsType<Row>)
      : []),
    { title: 'Nghỉ', width: 60, align: 'center', dataIndex: 'absentDays' },
    { title: 'Nhận xét GVCN', ellipsis: true, dataIndex: 'homeroomComment', render: (v: string | null) => v ?? '' },
    {
      title: '',
      width: 90,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          {canEdit && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />}
          <Tooltip title="Học bạ">
            <Link href={`/grades/transcript/${r.id}`}>
              <Button size="small" icon={<FileTextOutlined />} />
            </Link>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Kết quả học tập"
        extra={
          <Space wrap>
            <Select placeholder="Chọn lớp" value={classId} onChange={setClassId} style={{ width: 160 }} options={classOptions} showSearch optionFilterProp="label" />
            <Segmented value={semester} onChange={(v) => setSemester(Number(v))} options={[1, 2, 0].map((s) => ({ value: s, label: SEMESTER[s] }))} />
          </Space>
        }
      />
      {!classId ? (
        <Empty description="Chọn lớp để xem kết quả" />
      ) : (
        <>
          {data?.locked && <Alert type="info" showIcon icon={<LockOutlined />} style={{ marginBottom: 12 }} message={year ? 'Sổ điểm cả hai học kỳ đã khóa.' : 'Sổ điểm học kỳ này đã khóa.'} />}
          <Space wrap style={{ marginBottom: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={recompute} loading={busy === 'recompute'}>
              Tính lại
            </Button>
            {isAdmin && !year && (
              <Button icon={data?.locked ? <UnlockOutlined /> : <LockOutlined />} onClick={toggleLock} loading={busy === 'lock'} disabled={!data}>
                {data?.locked ? 'Mở khóa' : 'Khóa sổ điểm'}
              </Button>
            )}
            <Button icon={<DownloadOutlined />} onClick={exportCsv} loading={busy === 'export'} disabled={!data}>
              Xuất CSV
            </Button>
          </Space>
          {data && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <LevelCounts label="Học tập" counts={data.summary.academic} />
              <LevelCounts label="Rèn luyện" counts={data.summary.conduct} />
              {year && (
                <Space size={4} wrap>
                  <Typography.Text strong>Cả năm:</Typography.Text>
                  {Object.entries(data.summary.titles).map(([t, n]) => (
                    <Tag key={t} color="gold" style={{ margin: 0 }}>
                      {t} {n}
                    </Tag>
                  ))}
                  {['PROMOTED', 'RETEST', 'RETAINED'].map((p) => (
                    <Tag key={p} color={PROMOTION_STATUS[p].color} style={{ margin: 0 }}>
                      {PROMOTION_STATUS[p].label} {data.summary.promotion[p] ?? 0}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
          )}
          <Table<Row> rowKey="id" loading={isLoading} dataSource={data?.students ?? []} columns={columns} size="small" pagination={false} scroll={{ x: 1200 }} />
        </>
      )}
      <Modal title={editing ? `${editing.fullName} · ${SEMESTER[semester]}` : ''} open={!!editing} onCancel={() => setEditing(null)} onOk={submitEdit} okText="Lưu" cancelText="Hủy" confirmLoading={busy === 'edit'} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="absentDays" label="Số buổi nghỉ học" rules={[{ type: 'number', min: 0, max: 366 }]}>
            <InputNumber min={0} max={366} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="homeroomComment" label="Nhận xét của giáo viên chủ nhiệm">
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          {year && (
            <Form.Item name="promotion" label="Kết quả lên lớp" extra="Để trống để hệ thống tự xét theo kết quả học tập và rèn luyện">
              <Select allowClear options={options(Object.fromEntries(Object.entries(PROMOTION_STATUS).map(([k, v]) => [k, v.label])))} placeholder="Tự động" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}

'use client';

import { EditOutlined, FormOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Empty, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ReportButtons } from '@/components/grades/control/ReportButtons';
import { fmtMark, passedLabel, PromotionTag, ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { api } from '@/lib/api';
import { Retake, RetakeList, RetakeStudent, Scope } from './types';

/** The year result of a subject, then the retake result when there is one. */
function RetakeTag({ r }: { r: Retake }) {
  const comment = r.assessment === 'COMMENT';
  const year = comment ? passedLabel(r.yearPassed) : fmtMark(r.yearAverage);
  const result = comment ? (r.passed === null ? null : passedLabel(r.passed)) : r.score === null ? null : fmtMark(r.score);
  const failed = comment ? r.passed === false : r.score !== null && r.score < 5;
  return (
    <Tooltip title={r.note ?? undefined}>
      <Tag color={result === null ? 'default' : failed ? 'red' : 'green'} style={{ margin: 0 }}>
        {r.name}: {year} → {result ?? '?'}
      </Tag>
    </Tooltip>
  );
}

interface Draft {
  score?: number | null;
  passed?: boolean | null;
  note?: string | null;
}

/** Kiểm tra lại: who retakes which subjects, the results and the promotion that follows. */
export function RetakesTab({ scope, scopeName, office }: { scope: Scope; scopeName: string; office: boolean }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<RetakeList>(['/grades/review/retakes', scope]);
  const [choosing, setChoosing] = useState<RetakeStudent | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [entering, setEntering] = useState(false);
  const [subjectId, setSubjectId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) message.success(done);
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const registerAll = () =>
    run('all', async () => {
      const r = await api<{ students: number; subjects: number }>('/grades/review/retakes/register', { method: 'POST', body: scope });
      await mutate();
      message.success(`Đã đăng ký ${r.subjects} lượt môn cho ${r.students} học sinh`);
    });

  function openChoose(s: RetakeStudent) {
    setChoosing(s);
    setChosen(s.retakes.map((r) => r.subjectId));
  }
  const saveChoice = async () => {
    if (!choosing) return;
    const ok = await run('choose', async () => {
      await api(`/grades/review/retakes/${choosing.id}`, { method: 'PUT', body: { subjectIds: chosen } });
      await mutate();
    }, 'Đã lưu môn kiểm tra lại');
    if (ok) setChoosing(null);
  };

  // Results are entered one subject at a time, as a teacher marks the retake test.
  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of data?.students ?? []) for (const r of s.retakes) seen.set(r.subjectId, r.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [data]);
  const sheet = useMemo(
    () => (data?.students ?? []).flatMap((s) => s.retakes.filter((r) => r.subjectId === subjectId).map((r) => ({ student: s, retake: r }))),
    [data, subjectId],
  );
  function openEnter() {
    setDrafts({});
    setSubjectId((id) => (id && subjects.some((s) => s.value === id) ? id : subjects[0]?.value));
    setEntering(true);
  }
  const draft = (r: Retake) => ({ score: r.score, passed: r.passed, note: r.note, ...drafts[r.id] });
  const edit = (id: string, d: Draft) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...d } }));
  const saveResults = async () => {
    const entries = sheet
      .filter(({ retake }) => drafts[retake.id])
      .map(({ retake }) => ({ retakeId: retake.id, ...drafts[retake.id], ...(drafts[retake.id].note !== undefined ? { note: drafts[retake.id].note?.trim() || null } : {}) }));
    if (!entries.length) return setEntering(false);
    const ok = await run('results', async () => {
      await api('/grades/review/retakes/results', { method: 'PUT', body: { entries } });
      await mutate();
    }, 'Đã lưu kết quả kiểm tra lại');
    if (ok) {
      setDrafts({});
      setEntering(false);
    }
  };

  const columns: ColumnsType<RetakeStudent> = [
    { title: '#', width: 44, render: (_, __, i) => i + 1 },
    { title: 'Họ và tên', width: 190, render: (_, s) => <Link href={`/grades/transcript/${s.id}`}>{s.fullName}</Link> },
    { title: 'Lớp', width: 64, align: 'center', render: (_, s) => s.class.name },
    {
      title: 'Diện',
      width: 140,
      render: (_, s) =>
        s.reason === 'COMPLETION' ? (
          <Tooltip title="Môn đánh giá bằng nhận xét ở mức Chưa đạt: cần đạt khi kiểm tra lại để được công nhận hoàn thành chương trình THCS">
            <Tag color="purple">Hoàn thành THCS</Tag>
          </Tooltip>
        ) : (
          <Tag color="orange">Học tập Chưa đạt</Tag>
        ),
    },
    {
      title: 'Môn kiểm tra lại (cả năm → kiểm tra lại)',
      render: (_, s) =>
        s.retakes.length ? (
          <Space size={4} wrap>
            {s.retakes.map((r) => (
              <RetakeTag key={r.id} r={r} />
            ))}
          </Space>
        ) : (
          <Typography.Text type="warning">Chưa đăng ký: {s.eligible.map((e) => e.name).join(', ')}</Typography.Text>
        ),
    },
    { title: 'Học tập sau KTL', width: 110, align: 'center', render: (_, s) => <ResultLevelTag level={s.academicAfterRetake} /> },
    {
      title: 'Lên lớp',
      width: 120,
      align: 'center',
      render: (_, s) => (s.reason === 'COMPLETION' ? <Typography.Text type="secondary">—</Typography.Text> : <PromotionTag status={s.promotion} />),
    },
    ...(office
      ? ([
          {
            title: '',
            width: 52,
            render: (_, s) => (
              <Tooltip title="Chọn môn kiểm tra lại">
                <Button size="small" icon={<EditOutlined />} onClick={() => openChoose(s)} />
              </Tooltip>
            ),
          },
        ] as ColumnsType<RetakeStudent>)
      : []),
  ];

  const s = data?.summary;
  const choices = choosing
    ? [...new Map([...choosing.eligible.map((e) => [e.subjectId, e.name] as const), ...choosing.retakes.map((r) => [r.subjectId, r.name] as const)])].map(([value, name]) => {
        const entered = choosing.retakes.find((r) => r.subjectId === value)?.entered;
        return { value, label: entered ? `${name} (đã có kết quả)` : name, disabled: !!entered };
      })
    : [];

  return (
    <>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          {office && (
            <Button icon={<UsergroupAddOutlined />} onClick={registerAll} loading={busy === 'all'} disabled={!s?.unregistered}>
              Đăng ký môn cho học sinh chưa đăng ký
            </Button>
          )}
          <Button type="primary" icon={<FormOutlined />} onClick={openEnter} disabled={!subjects.length}>
            Nhập kết quả
          </Button>
        </Space>
        <ReportButtons label="Danh sách kiểm tra lại" report="retakes" query={scope} fileName={`kiem-tra-lai-${scopeName}`} />
      </Space>
      {s && (
        <Space size={4} wrap style={{ marginBottom: 12 }}>
          <Tag>Học sinh {s.students}</Tag>
          {s.unregistered > 0 && <Tag color="warning">Chưa đăng ký môn {s.unregistered}</Tag>}
          <Tag>Lượt môn {s.subjects}</Tag>
          <Tag color="blue">Đã có kết quả {s.entered}</Tag>
          <Tag color="green">Lên lớp sau kiểm tra lại {s.promoted}</Tag>
          <Tag color="red">Ở lại lớp {s.retained}</Tag>
        </Space>
      )}
      <Table<RetakeStudent>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.students ?? []}
        columns={columns}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="Không có học sinh phải kiểm tra lại" /> }}
      />

      <Modal title={choosing ? `Môn kiểm tra lại · ${choosing.fullName}` : ''} open={!!choosing} onCancel={() => setChoosing(null)} onOk={saveChoice} okText="Lưu" cancelText="Hủy" confirmLoading={busy === 'choose'} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          {choosing?.reason === 'COMPLETION'
            ? 'Môn đánh giá bằng nhận xét ở mức Chưa đạt.'
            : 'Môn có điểm trung bình cả năm dưới 5,0 và môn đánh giá bằng nhận xét ở mức Chưa đạt (Điều 14 Thông tư 22/2021).'}
        </Typography.Paragraph>
        <Checkbox.Group value={chosen} onChange={(v) => setChosen(v as string[])} options={choices} style={{ display: 'grid', gap: 8 }} />
      </Modal>

      <Modal title="Nhập kết quả kiểm tra lại" open={entering} onCancel={() => setEntering(false)} onOk={saveResults} okText="Lưu" cancelText="Hủy" confirmLoading={busy === 'results'} width={760} destroyOnHidden>
        <Space style={{ marginBottom: 12 }}>
          <Typography.Text>Môn:</Typography.Text>
          <Select value={subjectId} onChange={setSubjectId} options={subjects} style={{ width: 220 }} />
        </Space>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Giáo viên nhập kết quả môn mình dạy. Kết quả lên lớp được tính lại ngay sau khi lưu." />
        <Table
          rowKey={(x) => x.retake.id}
          size="small"
          pagination={false}
          dataSource={sheet}
          columns={[
            { title: 'Họ và tên', render: (_, x) => x.student.fullName },
            { title: 'Lớp', width: 60, align: 'center', render: (_, x) => x.student.class.name },
            { title: 'Cả năm', width: 80, align: 'center', render: (_, x) => (x.retake.assessment === 'COMMENT' ? passedLabel(x.retake.yearPassed) : fmtMark(x.retake.yearAverage)) },
            {
              title: 'Kiểm tra lại',
              width: 130,
              render: (_, x) =>
                x.retake.assessment === 'COMMENT' ? (
                  <Select
                    allowClear
                    placeholder="Chưa nhập"
                    value={draft(x.retake).passed ?? undefined}
                    onChange={(v) => edit(x.retake.id, { passed: v ?? null })}
                    options={[
                      { value: true, label: 'Đạt' },
                      { value: false, label: 'Chưa đạt' },
                    ]}
                    style={{ width: 120 }}
                  />
                ) : (
                  <InputNumber min={0} max={10} step={0.1} placeholder="Chưa nhập" value={draft(x.retake).score} onChange={(v) => edit(x.retake.id, { score: v ?? null })} style={{ width: 110 }} />
                ),
            },
            { title: 'Ghi chú', render: (_, x) => <Input value={draft(x.retake).note ?? ''} maxLength={500} onChange={(e) => edit(x.retake.id, { note: e.target.value })} /> },
          ]}
        />
      </Modal>
    </>
  );
}

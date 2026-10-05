'use client';

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useSubjects } from '@/lib/hooks';
import { DIFFICULTY, options, QUESTION_TYPE } from '@/lib/labels';
import { AnswerReview } from './AnswerReview';
import { DIFFICULTY_COLOR, score } from './model';
import { BankQuestion, QuestionEditor } from './QuestionEditor';

interface TestQuestion {
  id: string;
  questionId: string;
  sortOrder: number;
  points: number;
  question: BankQuestion;
}

type Item = { questionId: string; points: number };

/** Pick questions from the bank: filters, multi-select across pages, one point value for all. */
function BankPicker({ open, test, inTest, onClose, onAdd }: { open: boolean; test: any; inTest: Set<string>; onClose: () => void; onAdd: (ids: string[], points: number) => Promise<void> }) {
  const { data: subjects } = useSubjects();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState<string>();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [type, setType] = useState<string>();
  const [difficulty, setDifficulty] = useState<number>();
  const [selected, setSelected] = useState<string[]>([]);
  const [points, setPoints] = useState(1);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useSWR<{ items: BankQuestion[]; total: number }>(open ? ['/lms/questions', { page, pageSize: 10, q: q || undefined, subjectId, gradeLevel, type, difficulty }] : null);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setQ('');
    setSubjectId(test.subjectId ?? undefined);
    setGradeLevel(test.gradeLevel ?? undefined);
    setType(undefined);
    setDifficulty(undefined);
    setSelected([]);
    setPoints(1);
  }, [open, test.subjectId, test.gradeLevel]);

  const reset = () => setPage(1);
  return (
    <Modal
      title="Thêm câu hỏi từ ngân hàng"
      open={open}
      onCancel={onClose}
      width={900}
      okText={`Thêm ${selected.length} câu`}
      cancelText="Hủy"
      okButtonProps={{ disabled: !selected.length }}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await onAdd(selected, points);
          onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm trong nội dung" allowClear style={{ width: 200 }} onSearch={(v) => (setQ(v), reset())} />
        <Select placeholder="Môn học" allowClear style={{ width: 150 }} value={subjectId} onChange={(v) => (setSubjectId(v), reset())} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select placeholder="Khối" allowClear style={{ width: 100 }} value={gradeLevel} onChange={(v) => (setGradeLevel(v), reset())} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
        <Select placeholder="Loại" allowClear style={{ width: 160 }} value={type} onChange={(v) => (setType(v), reset())} options={options(QUESTION_TYPE)} />
        <Select placeholder="Mức độ" allowClear style={{ width: 140 }} value={difficulty} onChange={(v) => (setDifficulty(v), reset())} options={options(DIFFICULTY)} />
      </Space>
      <Table<BankQuestion>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 10, total: data?.total, onChange: setPage, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (r) => ({ disabled: inTest.has(r.id) }),
        }}
        columns={[
          {
            title: 'Câu hỏi',
            render: (_, r) => (
              <Typography.Paragraph ellipsis={{ rows: 2, tooltip: r.content }} style={{ margin: 0 }} type={inTest.has(r.id) ? 'secondary' : undefined}>
                {r.content}
                {inTest.has(r.id) && ' (đã có trong bài)'}
              </Typography.Paragraph>
            ),
          },
          { title: 'Loại', width: 140, render: (_, r) => QUESTION_TYPE[r.type] },
          { title: 'Mức độ', width: 120, render: (_, r) => <Tag color={DIFFICULTY_COLOR[r.difficulty]}>{DIFFICULTY[r.difficulty]}</Tag> },
          { title: 'Môn', width: 100, render: (_, r) => r.subject?.name ?? '' },
        ]}
      />
      <Space style={{ marginTop: 8 }}>
        <span>Điểm mỗi câu</span>
        <InputNumber min={0.25} max={100} decimalSeparator="," value={points} onChange={(v) => setPoints(Number(v ?? 1))} />
      </Space>
    </Modal>
  );
}

/** Draw random bank questions per difficulty level. */
function RandomModal({ open, test, onClose, onDone }: { open: boolean; test: any; onClose: () => void; onDone: (t: any) => void }) {
  const { message } = App.useApp();
  const { data: subjects } = useSubjects();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ subjectId: test.subjectId ?? undefined, gradeLevel: test.gradeLevel ?? undefined, points: 1, counts: { 1: 2, 2: 2, 3: 1 } });
  }, [open, test.subjectId, test.gradeLevel, form]);

  async function submit() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const counts = Object.fromEntries(Object.entries(v.counts ?? {}).filter(([, n]) => Number(n) > 0));
    if (!Object.keys(counts).length) {
      message.warning('Nhập số câu cần lấy cho ít nhất một mức độ');
      return;
    }
    setBusy(true);
    try {
      const r = await api(`/lms/tests/${test.id}/questions/random`, { method: 'POST', body: { subjectId: v.subjectId, gradeLevel: v.gradeLevel, points: v.points, counts } });
      const missing = Object.entries(r.missing as Record<string, number>).map(([d, n]) => `${n} câu ${DIFFICULTY[Number(d)]?.toLowerCase()}`);
      if (missing.length) message.warning(`Đã thêm ${r.added} câu; ngân hàng còn thiếu ${missing.join(', ')}`);
      else message.success(`Đã thêm ${r.added} câu ngẫu nhiên`);
      onDone(r.test);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Lấy câu hỏi ngẫu nhiên" open={open} onCancel={onClose} onOk={submit} okText="Thêm câu hỏi" cancelText="Hủy" confirmLoading={busy} forceRender>
      <Form form={form} layout="vertical">
        <Space wrap>
          <Form.Item name="subjectId" label="Môn học">
            <Select allowClear style={{ width: 180 }} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="gradeLevel" label="Khối">
            <Select allowClear style={{ width: 110 }} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
          </Form.Item>
          <Form.Item name="points" label="Điểm mỗi câu">
            <InputNumber min={0.25} max={100} decimalSeparator="," />
          </Form.Item>
        </Space>
        <Typography.Text strong>Số câu theo mức độ</Typography.Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <Form.Item key={d} name={['counts', String(d)]} label={DIFFICULTY[d]} style={{ marginBottom: 8 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          ))}
        </div>
        <Typography.Text type="secondary">Chỉ lấy câu hỏi đang dùng và chưa có trong bài.</Typography.Text>
      </Form>
    </Modal>
  );
}

/** The questions of a test in order, with points; editable until the first student starts. */
export function TestQuestionsTab({ test, onChanged }: { test: any; onChanged: (t: any) => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [random, setRandom] = useState(false);
  const [creating, setCreating] = useState(false);
  const items: TestQuestion[] = test.questions;
  const editable = test.status !== 'CLOSED' && test.attemptCount === 0;
  const current = (): Item[] => items.map((i) => ({ questionId: i.questionId, points: i.points }));

  async function save(list: Item[], ok?: string) {
    setBusy(true);
    try {
      const t = await api(`/lms/tests/${test.id}/questions`, { method: 'PUT', body: { questions: list } });
      onChanged(t);
      if (ok) message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, d: number) => {
    const list = current();
    [list[i], list[i + d]] = [list[i + d], list[i]];
    save(list);
  };
  const setPoints = (i: number, p: number | null) => {
    if (!p || p === items[i].points) return;
    const list = current();
    list[i] = { ...list[i], points: p };
    save(list);
  };
  const add = async (ids: string[], points: number) => {
    const have = new Set(items.map((i) => i.questionId));
    const extra = ids.filter((id) => !have.has(id)).map((questionId) => ({ questionId, points }));
    await save([...current(), ...extra], `Đã thêm ${extra.length} câu hỏi`);
  };

  return (
    <>
      {!editable && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={test.status === 'CLOSED' ? 'Bài kiểm tra đã đóng, không thể thay đổi câu hỏi.' : 'Đã có học sinh làm bài nên không thể thay đổi câu hỏi. Có thể sửa nội dung câu hỏi trong ngân hàng.'}
        />
      )}
      {editable && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => setPicking(true)}>
            Thêm từ ngân hàng
          </Button>
          <Button icon={<ThunderboltOutlined />} onClick={() => setRandom(true)}>
            Lấy ngẫu nhiên theo mức độ
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Soạn câu hỏi mới
          </Button>
        </Space>
      )}
      <Table<TestQuestion>
        rowKey="id"
        loading={busy}
        dataSource={items}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Bài kiểm tra chưa có câu hỏi' }}
        expandable={{
          expandedRowRender: (r) => (
            <div style={{ maxWidth: 760, padding: '4px 8px' }}>
              <AnswerReview question={r.question} correctAnswer={r.question.answer} mode="key" />
            </div>
          ),
        }}
        summary={() =>
          items.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <b>{items.length} câu hỏi</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={3}>
                <b>Tổng điểm: {score(test.maxScore)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
        columns={[
          { title: '#', width: 50, render: (_, __, i) => i + 1 },
          {
            title: 'Câu hỏi',
            render: (_, r) => (
              <Typography.Paragraph ellipsis={{ rows: 2, tooltip: r.question.content }} style={{ margin: 0 }}>
                {r.question.content}
                {!r.question.isActive && <Tag style={{ marginLeft: 8 }}>đã ẩn</Tag>}
              </Typography.Paragraph>
            ),
          },
          { title: 'Loại', width: 140, render: (_, r) => QUESTION_TYPE[r.question.type] },
          { title: 'Mức độ', width: 120, render: (_, r) => <Tag color={DIFFICULTY_COLOR[r.question.difficulty]}>{DIFFICULTY[r.question.difficulty]}</Tag> },
          {
            title: 'Điểm',
            width: 100,
            render: (_, r, i) =>
              editable ? (
                <InputNumber
                  key={`${r.id}:${r.points}`}
                  size="small"
                  min={0.25}
                  max={100}
                  decimalSeparator=","
                  defaultValue={r.points}
                  onBlur={(e) => setPoints(i, Number(e.target.value.replace(',', '.')) || null)}
                  onPressEnter={(e) => setPoints(i, Number((e.target as HTMLInputElement).value.replace(',', '.')) || null)}
                  style={{ width: 80 }}
                  aria-label={`Điểm câu ${i + 1}`}
                />
              ) : (
                score(r.points)
              ),
          },
          ...(editable
            ? [
                {
                  title: '',
                  width: 120,
                  render: (_: unknown, __: TestQuestion, i: number) => (
                    <Space size={4}>
                      <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Lên" />
                      <Button size="small" icon={<ArrowDownOutlined />} disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Xuống" />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => save(current().filter((_, j) => j !== i), 'Đã bỏ câu hỏi khỏi bài')}
                        aria-label="Bỏ khỏi bài"
                      />
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <BankPicker open={picking} test={test} inTest={new Set(items.map((i) => i.questionId))} onClose={() => setPicking(false)} onAdd={add} />
      <RandomModal open={random} test={test} onClose={() => setRandom(false)} onDone={onChanged} />
      <QuestionEditor
        open={creating}
        initial={null}
        defaults={{ subjectId: test.subjectId, gradeLevel: test.gradeLevel }}
        onClose={() => setCreating(false)}
        onSaved={(q) => add([q.id], 1)}
      />
    </>
  );
}

'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Col, Drawer, Form, Input, Radio, Row, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useSubjects } from '@/lib/hooks';
import { DIFFICULTY, options, QUESTION_TYPE } from '@/lib/labels';
import { AnswerReview } from './AnswerReview';
import { letter } from './AnswerWidget';
import { choices, countBlanks, matching, QuestionType, scramble } from './model';

export interface BankQuestion {
  id: string;
  type: QuestionType;
  content: string;
  subjectId: string | null;
  subject?: { id: string; code: string; name: string } | null;
  gradeLevel: number | null;
  difficulty: number;
  options: unknown;
  answer: unknown;
  explanation: string | null;
  tags: string[];
  isActive: boolean;
  usedIn?: number;
}

interface FormValues {
  type: QuestionType;
  subjectId?: string;
  gradeLevel?: number;
  difficulty: number;
  content: string;
  explanation?: string;
  tags?: string[];
  isActive?: boolean;
  /** Choice texts; for ORDERING they are entered in the correct order. */
  choices?: { text?: string; correct?: boolean }[];
  correctIndex?: number;
  tfValue?: boolean;
  blanks?: string[][];
  accepted?: string[];
  numValue?: string;
  tolerance?: string;
  pairs?: { left?: string; right?: string }[];
}

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const CHOICE_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ORDERING'];
const emptyChoices = (n = 4) => Array.from({ length: n }, () => ({ text: '' }));
const emptyPairs = () => Array.from({ length: 3 }, () => ({ left: '', right: '' }));

/** Turns a stored question into the editor's fields. */
function toForm(q: BankQuestion): FormValues {
  const key = rec(q.answer);
  const base: FormValues = {
    type: q.type,
    subjectId: q.subjectId ?? undefined,
    gradeLevel: q.gradeLevel ?? undefined,
    difficulty: q.difficulty,
    content: q.content,
    explanation: q.explanation ?? undefined,
    tags: q.tags,
    isActive: q.isActive,
  };
  const list = choices(q.options);
  switch (q.type) {
    case 'SINGLE_CHOICE':
      return { ...base, choices: list.map((o) => ({ text: o.text })), correctIndex: list.findIndex((o) => o.key === key.key) };
    case 'MULTIPLE_CHOICE':
      return { ...base, choices: list.map((o) => ({ text: o.text, correct: (key.keys ?? []).includes(o.key) })) };
    case 'ORDERING':
      return { ...base, choices: ((key.order ?? []) as string[]).map((k) => ({ text: list.find((o) => o.key === k)?.text ?? '' })) };
    case 'TRUE_FALSE':
      return { ...base, tfValue: key.value === true };
    case 'FILL_BLANK':
      return { ...base, blanks: key.blanks ?? [] };
    case 'SHORT_ANSWER':
      return { ...base, accepted: key.accepted ?? [] };
    case 'NUMERIC':
      return { ...base, numValue: key.value === undefined ? undefined : String(key.value).replace('.', ','), tolerance: key.tolerance ? String(key.tolerance).replace('.', ',') : undefined };
    case 'MATCHING': {
      const m = matching(q.options);
      const pairs = rec(key.pairs);
      return { ...base, pairs: m.left.map((l) => ({ left: l.text, right: m.right.find((r) => r.key === pairs[l.key])?.text ?? '' })) };
    }
    default:
      return base;
  }
}

/**
 * Builds { options, answer } from the editor fields. Ordering items and the right column
 * of a matching question are stored scrambled, with keys assigned after scrambling so
 * the keys do not give the order away.
 */
function toPayload(v: FormValues): { options: unknown; answer: unknown } {
  const texts = (v.choices ?? []).map((c) => (c.text ?? '').trim());
  if (CHOICE_TYPES.includes(v.type)) {
    if (texts.length < 2) throw new Error('Cần ít nhất 2 phương án');
    if (texts.some((t) => !t)) throw new Error('Nhập nội dung cho mọi phương án hoặc xóa phương án trống');
  }
  switch (v.type) {
    case 'SINGLE_CHOICE': {
      const opts = texts.map((text, i) => ({ key: letter(i), text }));
      if (v.correctIndex === undefined || v.correctIndex < 0 || v.correctIndex >= opts.length) throw new Error('Chọn đáp án đúng');
      return { options: opts, answer: { key: opts[v.correctIndex].key } };
    }
    case 'MULTIPLE_CHOICE': {
      const opts = texts.map((text, i) => ({ key: letter(i), text }));
      const keys = opts.filter((_, i) => v.choices?.[i]?.correct).map((o) => o.key);
      if (!keys.length) throw new Error('Đánh dấu ít nhất một đáp án đúng');
      return { options: opts, answer: { keys } };
    }
    case 'ORDERING': {
      const shown = scramble(texts.map((text, i) => ({ text, rank: i })));
      const opts = shown.map((o, i) => ({ key: letter(i), text: o.text }));
      const order = [...shown.keys()].sort((a, b) => shown[a].rank - shown[b].rank).map((i) => opts[i].key);
      return { options: opts, answer: { order } };
    }
    case 'TRUE_FALSE':
      return { options: null, answer: { value: !!v.tfValue } };
    case 'FILL_BLANK': {
      const n = countBlanks(v.content ?? '');
      if (!n) throw new Error('Nội dung cần có ít nhất một chỗ trống "___"');
      const blanks = Array.from({ length: n }, (_, i) => (v.blanks?.[i] ?? []).map((s) => s.trim()).filter(Boolean));
      const missing = blanks.findIndex((b) => !b.length);
      if (missing >= 0) throw new Error(`Nhập đáp án cho chỗ trống ${missing + 1}`);
      return { options: null, answer: { blanks } };
    }
    case 'SHORT_ANSWER': {
      const accepted = (v.accepted ?? []).map((s) => s.trim()).filter(Boolean);
      if (!accepted.length) throw new Error('Nhập ít nhất một đáp án được chấp nhận');
      return { options: null, answer: { accepted } };
    }
    case 'NUMERIC': {
      if (!v.numValue?.trim()) throw new Error('Nhập đáp án số');
      return { options: null, answer: { value: v.numValue.trim(), tolerance: v.tolerance?.trim() || undefined } };
    }
    case 'MATCHING': {
      const pairs = (v.pairs ?? []).map((p) => ({ left: (p.left ?? '').trim(), right: (p.right ?? '').trim() }));
      if (pairs.length < 2) throw new Error('Cần ít nhất 2 cặp ghép');
      if (pairs.some((p) => !p.left || !p.right)) throw new Error('Nhập đủ hai vế cho mọi cặp ghép');
      const left = pairs.map((p, i) => ({ key: `L${i + 1}`, text: p.left }));
      const shown = scramble(pairs.map((p, i) => ({ text: p.right, of: i })));
      const right = shown.map((r, j) => ({ key: `R${j + 1}`, text: r.text }));
      const answer = Object.fromEntries(shown.map((r, j) => [left[r.of].key, right[j].key]));
      return { options: { left, right }, answer: { pairs: answer } };
    }
    default:
      return { options: null, answer: null };
  }
}

/** Defaults for a question type the editor switches to, keeping what is already typed. */
function shapeFor(type: QuestionType, v: Partial<FormValues>): Partial<FormValues> {
  if (CHOICE_TYPES.includes(type) && !(v.choices ?? []).length) return { choices: emptyChoices(type === 'ORDERING' ? 3 : 4) };
  if (type === 'MATCHING' && !(v.pairs ?? []).length) return { pairs: emptyPairs() };
  if (type === 'TRUE_FALSE' && v.tfValue === undefined) return { tfValue: true };
  return {};
}

/** Create or edit a bank question; the answer fields change with the question type. */
export function QuestionEditor({
  open,
  initial,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: BankQuestion | null;
  defaults?: Partial<Pick<BankQuestion, 'subjectId' | 'gradeLevel' | 'difficulty' | 'type'>>;
  onClose: () => void;
  onSaved: (q: BankQuestion) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { data: subjects } = useSubjects();
  const { data: tags } = useSWR<string[]>(open ? ['/lms/questions/tags'] : null);
  const type: QuestionType = Form.useWatch('type', form) ?? 'SINGLE_CHOICE';
  const content: string = Form.useWatch('content', form) ?? '';
  const correctIndex: number | undefined = Form.useWatch('correctIndex', form);
  const all = Form.useWatch([], form) as FormValues | undefined;
  // Read through a ref so a parent re-render with a new defaults object does not reset what is being typed.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setProblem(null);
    if (initial) form.setFieldsValue(toForm(initial));
    else {
      const d = defaultsRef.current;
      const t = (d?.type as QuestionType) ?? 'SINGLE_CHOICE';
      form.setFieldsValue({ type: t, difficulty: d?.difficulty ?? 1, subjectId: d?.subjectId ?? undefined, gradeLevel: d?.gradeLevel ?? undefined, tags: [], ...shapeFor(t, {}) });
    }
  }, [open, initial, form]);

  // Live preview of the key as students will be graded against it.
  let preview: { options: unknown; answer: unknown } | null = null;
  try {
    preview = all?.type && all.content ? toPayload(all) : null;
  } catch {
    preview = null;
  }

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    let payload: { options: unknown; answer: unknown };
    try {
      payload = toPayload(v);
    } catch (e) {
      setProblem((e as Error).message);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const body = {
        type: v.type,
        content: v.content.trim(),
        subjectId: v.subjectId ?? null,
        gradeLevel: v.gradeLevel ?? null,
        difficulty: v.difficulty,
        explanation: v.explanation?.trim() ?? '',
        tags: v.tags ?? [],
        ...payload,
        ...(initial ? { isActive: v.isActive ?? true } : {}),
      };
      // Create rejects explicit nulls on optional ids; omit them there.
      const createBody = Object.fromEntries(Object.entries(body).filter(([, x]) => x !== null && x !== ''));
      const q = initial ? await api<BankQuestion>(`/lms/questions/${initial.id}`, { method: 'PATCH', body }) : await api<BankQuestion>('/lms/questions', { method: 'POST', body: { ...createBody, options: payload.options, answer: payload.answer } });
      message.success(initial ? 'Đã lưu câu hỏi' : 'Đã thêm câu hỏi vào ngân hàng');
      onSaved(q);
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const blanks = countBlanks(content);

  return (
    <Drawer
      title={initial ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}
      open={open}
      onClose={onClose}
      width={760}
      forceRender
      extra={
        <Space>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Lưu
          </Button>
        </Space>
      }
    >
      {initial?.usedIn ? <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Câu hỏi đang dùng trong ${initial.usedIn} bài kiểm tra. Bài làm đã nộp giữ nguyên điểm; các lần làm mới dùng nội dung đã sửa.`} /> : null}
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changed: Partial<FormValues>) => {
          if (changed.type) form.setFieldsValue(shapeFor(changed.type, form.getFieldsValue(true)));
        }}
      >
        <Row gutter={12}>
          <Col xs={24} md={10}>
            <Form.Item name="type" label="Loại câu hỏi" rules={[{ required: true }]}>
              <Select options={Object.entries(QUESTION_TYPE).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="subjectId" label="Môn học">
              <Select allowClear showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gradeLevel" label="Khối">
              <Select allowClear options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={10}>
            <Form.Item name="difficulty" label="Mức độ" rules={[{ required: true }]}>
              <Select options={options(DIFFICULTY).map((o) => ({ ...o, label: `${o.value}. ${o.label}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item name="tags" label="Thẻ (chương, chủ đề)">
              <Select mode="tags" tokenSeparators={[',', ';']} options={(tags ?? []).map((t) => ({ value: t, label: t }))} placeholder="phân số, chương 1" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="content"
          label="Nội dung câu hỏi"
          rules={[{ required: true, whitespace: true, message: 'Nhập nội dung câu hỏi' }]}
          extra={type === 'FILL_BLANK' ? `Dùng ba dấu gạch dưới ___ cho mỗi chỗ trống. Hiện có ${blanks} chỗ trống.` : undefined}
        >
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={10000} />
        </Form.Item>

        {CHOICE_TYPES.includes(type) && (
          <Form.Item
            label={type === 'ORDERING' ? 'Các mục, nhập theo thứ tự đúng' : type === 'SINGLE_CHOICE' ? 'Phương án (chọn một đáp án đúng)' : 'Phương án (đánh dấu các đáp án đúng)'}
            extra={type === 'ORDERING' ? 'Hệ thống lưu các mục theo thứ tự xáo trộn để học sinh sắp xếp lại.' : undefined}
            required
          >
            <Form.List name="choices">
              {(fields, { add, remove }) => (
                <div style={{ display: 'grid', gap: 8 }}>
                  {fields.map((f, i) => (
                    <div key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {type === 'SINGLE_CHOICE' && <Radio checked={correctIndex === i} onChange={() => form.setFieldValue('correctIndex', i)} aria-label={`Đáp án đúng ${letter(i)}`} />}
                      {type === 'MULTIPLE_CHOICE' && (
                        <Form.Item name={[f.name, 'correct']} valuePropName="checked" noStyle>
                          <Checkbox aria-label={`Đáp án đúng ${letter(i)}`} />
                        </Form.Item>
                      )}
                      <b style={{ width: 20 }}>{type === 'ORDERING' ? `${i + 1}.` : `${letter(i)}.`}</b>
                      <Form.Item name={[f.name, 'text']} noStyle>
                        <Input placeholder={type === 'ORDERING' ? `Mục thứ ${i + 1}` : `Phương án ${letter(i)}`} maxLength={1000} />
                      </Form.Item>
                      <Button
                        icon={<DeleteOutlined />}
                        disabled={fields.length <= 2}
                        onClick={() => {
                          remove(f.name);
                          if (type === 'SINGLE_CHOICE' && correctIndex !== undefined) form.setFieldValue('correctIndex', correctIndex === i ? undefined : correctIndex > i ? correctIndex - 1 : correctIndex);
                        }}
                        aria-label="Xóa phương án"
                      />
                    </div>
                  ))}
                  {fields.length < 10 && (
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ text: '' })}>
                      Thêm {type === 'ORDERING' ? 'mục' : 'phương án'}
                    </Button>
                  )}
                </div>
              )}
            </Form.List>
            <Form.Item name="correctIndex" hidden>
              <Input />
            </Form.Item>
          </Form.Item>
        )}

        {type === 'TRUE_FALSE' && (
          <Form.Item name="tfValue" label="Đáp án đúng">
            <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: true, label: 'Đúng' }, { value: false, label: 'Sai' }]} />
          </Form.Item>
        )}

        {type === 'FILL_BLANK' &&
          (blanks ? (
            <Form.Item label="Đáp án cho từng chỗ trống" extra="Có thể nhập nhiều đáp án được chấp nhận cho một chỗ trống; nhấn Enter sau mỗi đáp án. Không phân biệt hoa thường và dấu." required>
              <div style={{ display: 'grid', gap: 8 }}>
                {Array.from({ length: blanks }, (_, i) => (
                  <Form.Item key={i} name={['blanks', i]} noStyle>
                    <Select mode="tags" open={false} tokenSeparators={[';']} placeholder={`Chỗ trống ${i + 1}`} suffixIcon={null} />
                  </Form.Item>
                ))}
              </div>
            </Form.Item>
          ) : (
            <Alert type="warning" showIcon style={{ marginBottom: 16 }} message='Thêm ít nhất một chỗ trống "___" vào nội dung câu hỏi.' />
          ))}

        {type === 'SHORT_ANSWER' && (
          <Form.Item name="accepted" label="Các đáp án được chấp nhận" extra="Nhấn Enter sau mỗi đáp án. Không phân biệt hoa thường và dấu." required>
            <Select mode="tags" open={false} tokenSeparators={[';']} suffixIcon={null} placeholder="mười; 10" />
          </Form.Item>
        )}

        {type === 'NUMERIC' && (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="numValue" label="Đáp án" required>
                <Input inputMode="decimal" placeholder="3,5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tolerance" label="Sai số cho phép">
                <Input inputMode="decimal" placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {type === 'MATCHING' && (
          <Form.Item label="Các cặp ghép đúng" extra="Cột phải được lưu theo thứ tự xáo trộn." required>
            <Form.List name="pairs">
              {(fields, { add, remove }) => (
                <div style={{ display: 'grid', gap: 8 }}>
                  {fields.map((f, i) => (
                    <div key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <b style={{ width: 20 }}>{i + 1}.</b>
                      <Form.Item name={[f.name, 'left']} noStyle>
                        <Input placeholder="Vế trái" maxLength={500} />
                      </Form.Item>
                      <span>→</span>
                      <Form.Item name={[f.name, 'right']} noStyle>
                        <Input placeholder="Vế phải" maxLength={500} />
                      </Form.Item>
                      <Button icon={<DeleteOutlined />} disabled={fields.length <= 2} onClick={() => remove(f.name)} aria-label="Xóa cặp" />
                    </div>
                  ))}
                  {fields.length < 10 && (
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ left: '', right: '' })}>
                      Thêm cặp
                    </Button>
                  )}
                </div>
              )}
            </Form.List>
          </Form.Item>
        )}

        {type === 'ESSAY' && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Câu tự luận không chấm tự động; giáo viên chấm điểm sau khi học sinh nộp bài. Ghi gợi ý chấm vào phần giải thích." />}

        <Form.Item name="explanation" label={type === 'ESSAY' ? 'Đáp án tham khảo / gợi ý chấm' : 'Giải thích'}
          extra="Học sinh xem được sau khi nộp nếu bài kiểm tra cho xem đáp án.">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} />
        </Form.Item>
        {initial && (
          <Form.Item name="isActive" label="Đang dùng" valuePropName="checked" extra="Câu hỏi đã ẩn không xuất hiện khi chọn câu hỏi cho bài kiểm tra.">
            <Switch />
          </Form.Item>
        )}
      </Form>
      {problem && <Alert type="error" showIcon message={problem} style={{ marginBottom: 12 }} />}
      {preview && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Typography.Text strong>Xem trước đáp án</Typography.Text>
          <div style={{ marginTop: 8 }}>
            <AnswerReview question={{ type: all!.type, content: all!.content, options: preview.options }} correctAnswer={preview.answer} mode="key" />
          </div>
        </div>
      )}
    </Drawer>
  );
}

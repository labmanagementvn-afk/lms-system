'use client';

import { ArrowDownOutlined, ArrowUpOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Radio, Select, Typography } from 'antd';
import { CSSProperties, Fragment, ReactNode } from 'react';
import { BLANK, choices, countBlanks, matching, ShownQuestion } from './model';

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
/** Options are labelled by position (A, B, C…) because their keys travel with them when shuffled. */
export const letter = (i: number) => String.fromCharCode(65 + i);

const box = (selected: boolean, disabled?: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
  margin: 0,
  padding: '10px 12px',
  border: `1px solid ${selected ? '#1d4ed8' : '#e5e7eb'}`,
  background: selected ? '#eff6ff' : '#fff',
  borderRadius: 8,
  cursor: disabled ? 'default' : 'pointer',
});

/** The question text with its line breaks; fill-in questions render their blanks inside the widget instead. */
export function QuestionText({ content }: { content: string }) {
  return <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 15, marginBottom: 12 }}>{content}</Typography.Paragraph>;
}

/** Fill-in sentence with something rendered in place of each "___". */
export function BlankSentence({ content, render }: { content: string; render: (index: number) => ReactNode }) {
  const parts = content.split(BLANK);
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 2.4, marginBottom: 12 }}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && render(i)}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Answer input for one question in the student test runner. `value` and `onChange`
 * use the API's answer shapes ({ key }, { keys }, { value }, { blanks }, { text }, { pairs }, { order });
 * `null` clears the answer.
 */
export function AnswerWidget({ question, value, onChange, disabled }: { question: ShownQuestion; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const a = rec(value);
  const text = (t: string) => (t.trim() ? t : null);

  switch (question.type) {
    case 'SINGLE_CHOICE':
      return (
        <>
          <QuestionText content={question.content} />
          <Radio.Group value={a.key} disabled={disabled} onChange={(e) => onChange({ key: e.target.value })} style={{ display: 'grid', gap: 8, width: '100%' }}>
            {choices(question.options).map((o, i) => (
              <Radio key={o.key} value={o.key} style={box(a.key === o.key, disabled)}>
                <b>{letter(i)}.</b> {o.text}
              </Radio>
            ))}
          </Radio.Group>
        </>
      );
    case 'MULTIPLE_CHOICE': {
      const picked: string[] = Array.isArray(a.keys) ? a.keys : [];
      return (
        <>
          <QuestionText content={question.content} />
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
            Chọn tất cả các đáp án đúng.
          </Typography.Text>
          <Checkbox.Group value={picked} disabled={disabled} onChange={(v) => onChange(v.length ? { keys: v } : null)} style={{ display: 'grid', gap: 8, width: '100%' }}>
            {choices(question.options).map((o, i) => (
              <Checkbox key={o.key} value={o.key} style={box(picked.includes(o.key), disabled)}>
                <b>{letter(i)}.</b> {o.text}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </>
      );
    }
    case 'TRUE_FALSE':
      return (
        <>
          <QuestionText content={question.content} />
          <Radio.Group value={a.value} disabled={disabled} onChange={(e) => onChange({ value: e.target.value })} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
            <Radio value={true} style={box(a.value === true, disabled)}>
              Đúng
            </Radio>
            <Radio value={false} style={box(a.value === false, disabled)}>
              Sai
            </Radio>
          </Radio.Group>
        </>
      );
    case 'FILL_BLANK': {
      const n = countBlanks(question.content);
      const blanks: string[] = Array.from({ length: n }, (_, i) => (Array.isArray(a.blanks) ? String(a.blanks[i] ?? '') : ''));
      const set = (i: number, v: string) => {
        const next = [...blanks];
        next[i] = v;
        onChange(next.some((b) => b.trim()) ? { blanks: next } : null);
      };
      return (
        <BlankSentence
          content={question.content}
          render={(i) => (
            <Input
              size="small"
              disabled={disabled}
              value={blanks[i]}
              onChange={(e) => set(i, e.target.value)}
              placeholder={`(${i + 1})`}
              aria-label={`Chỗ trống ${i + 1}`}
              style={{ width: 150, margin: '0 4px' }}
            />
          )}
        />
      );
    }
    case 'SHORT_ANSWER':
      return (
        <>
          <QuestionText content={question.content} />
          <Input disabled={disabled} value={a.text ?? ''} onChange={(e) => onChange(text(e.target.value) ? { text: e.target.value } : null)} placeholder="Nhập câu trả lời" maxLength={500} />
        </>
      );
    case 'NUMERIC':
      return (
        <>
          <QuestionText content={question.content} />
          <Input
            disabled={disabled}
            inputMode="decimal"
            value={a.value ?? ''}
            onChange={(e) => onChange(text(e.target.value) ? { value: e.target.value } : null)}
            placeholder="Nhập kết quả, ví dụ 3,5"
            style={{ maxWidth: 240 }}
          />
        </>
      );
    case 'MATCHING': {
      const m = matching(question.options);
      const pairs = rec(a.pairs);
      const set = (left: string, right: string | undefined) => {
        const next = { ...pairs };
        if (right) next[left] = right;
        else delete next[left];
        onChange(Object.keys(next).length ? { pairs: next } : null);
      };
      return (
        <>
          <QuestionText content={question.content} />
          <div style={{ display: 'grid', gap: 8 }}>
            {m.left.map((l, i) => (
              <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                <div style={{ ...box(!!pairs[l.key]), cursor: 'default' }}>
                  <b>{i + 1}.</b> {l.text}
                </div>
                <Select
                  disabled={disabled}
                  allowClear
                  placeholder="Ghép với…"
                  value={pairs[l.key]}
                  onChange={(v) => set(l.key, v)}
                  options={m.right.map((r, j) => ({ value: r.key, label: `${letter(j)}. ${r.text}` }))}
                  aria-label={`Ghép mục ${i + 1}`}
                />
              </div>
            ))}
          </div>
        </>
      );
    }
    case 'ORDERING': {
      const items = choices(question.options);
      const byKey = new Map(items.map((o) => [o.key, o]));
      const given: string[] = Array.isArray(a.order) ? a.order.filter((k: string) => byKey.has(k)) : [];
      const order = given.length ? [...given, ...items.map((o) => o.key).filter((k) => !given.includes(k))] : items.map((o) => o.key);
      const move = (i: number, d: number) => {
        const next = [...order];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        onChange({ order: next });
      };
      return (
        <>
          <QuestionText content={question.content} />
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
            Dùng các nút mũi tên để sắp xếp, mục đầu tiên ở trên cùng.
          </Typography.Text>
          <div style={{ display: 'grid', gap: 8 }}>
            {order.map((k, i) => (
              <div key={k} style={{ ...box(given.length > 0), cursor: 'default', alignItems: 'center' }}>
                <b style={{ width: 20 }}>{i + 1}.</b>
                <span style={{ flex: 1 }}>{byKey.get(k)?.text}</span>
                <Button size="small" icon={<ArrowUpOutlined />} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Lên" />
                <Button size="small" icon={<ArrowDownOutlined />} disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} aria-label="Xuống" />
              </div>
            ))}
          </div>
          {!given.length && !disabled && (
            <Button type="link" icon={<CheckOutlined />} style={{ padding: 0, marginTop: 8 }} onClick={() => onChange({ order })}>
              Giữ nguyên thứ tự này làm câu trả lời
            </Button>
          )}
        </>
      );
    }
    case 'ESSAY':
      return (
        <>
          <QuestionText content={question.content} />
          <Input.TextArea
            disabled={disabled}
            value={a.text ?? ''}
            onChange={(e) => onChange(text(e.target.value) ? { text: e.target.value } : null)}
            autoSize={{ minRows: 6, maxRows: 20 }}
            maxLength={20000}
            showCount
            placeholder="Viết bài làm của em"
          />
        </>
      );
    default:
      return <QuestionText content={question.content} />;
  }
}

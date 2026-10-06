'use client';

import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import { CSSProperties, ReactNode } from 'react';
import { BlankSentence, letter, QuestionText } from './AnswerWidget';
import { choices, matching, normalizeText, QuestionType } from './model';

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const GREEN = '#16a34a';
const RED = '#dc2626';

const row = (border: string, background: string): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 12px',
  border: `1px solid ${border}`,
  background,
  borderRadius: 8,
});

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: 14, marginTop: 6 }}>
      <Typography.Text type="secondary">{label}: </Typography.Text>
      {children}
    </div>
  );
}

const NoAnswer = () => <Typography.Text type="danger">Không trả lời</Typography.Text>;
const Mark = ({ ok }: { ok: boolean }) => (ok ? <CheckCircleFilled style={{ color: GREEN }} /> : <CloseCircleFilled style={{ color: RED }} />);

/**
 * A question with the student's answer next to the answer key.
 * mode "key" shows only the key (question bank preview); mode "review" shows both.
 */
export function AnswerReview({
  question,
  myAnswer,
  correctAnswer,
  mode = 'review',
  who = 'Em',
}: {
  question: { type: QuestionType; content: string; options: unknown };
  myAnswer?: unknown;
  correctAnswer: unknown;
  mode?: 'review' | 'key';
  /** How the answerer is named: "Em" in the student app, "Học sinh" in the portal. */
  who?: string;
}) {
  const review = mode === 'review';
  const mine = rec(myAnswer);
  const key = rec(correctAnswer);
  const hasKey = correctAnswer !== null && correctAnswer !== undefined;
  const answered = myAnswer !== null && myAnswer !== undefined;

  switch (question.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const right: string[] = question.type === 'SINGLE_CHOICE' ? (key.key ? [key.key] : []) : Array.isArray(key.keys) ? key.keys : [];
      const picked: string[] = question.type === 'SINGLE_CHOICE' ? (mine.key ? [mine.key] : []) : Array.isArray(mine.keys) ? mine.keys : [];
      return (
        <>
          <QuestionText content={question.content} />
          <div style={{ display: 'grid', gap: 6 }}>
            {choices(question.options).map((o, i) => {
              const isRight = right.includes(o.key);
              const isPicked = review && picked.includes(o.key);
              const style = isRight ? row('#86efac', '#f0fdf4') : isPicked ? row('#fca5a5', '#fef2f2') : row('#e5e7eb', '#fff');
              return (
                <div key={o.key} style={style}>
                  <b>{letter(i)}.</b>
                  <span style={{ flex: 1 }}>{o.text}</span>
                  {isPicked && <Tag color={isRight ? 'green' : 'red'}>{who} chọn</Tag>}
                  {isRight && <CheckCircleFilled style={{ color: GREEN, marginTop: 4 }} />}
                </div>
              );
            })}
          </div>
          {review && !answered && <Line label="Trả lời">{<NoAnswer />}</Line>}
        </>
      );
    }
    case 'TRUE_FALSE': {
      const label = (v: unknown) => (v === true ? 'Đúng' : v === false ? 'Sai' : '');
      return (
        <>
          <QuestionText content={question.content} />
          {review && <Line label={`${who} chọn`}>{answered ? <b style={{ color: mine.value === key.value ? GREEN : RED }}>{label(mine.value)}</b> : <NoAnswer />}</Line>}
          {hasKey && (
            <Line label="Đáp án">
              <b>{label(key.value)}</b>
            </Line>
          )}
        </>
      );
    }
    case 'FILL_BLANK': {
      const accepted: string[][] = Array.isArray(key.blanks) ? key.blanks : [];
      const given: string[] = Array.isArray(mine.blanks) ? mine.blanks : [];
      const ok = (i: number) => (accepted[i] ?? []).map(normalizeText).includes(normalizeText(given[i]));
      return (
        <>
          <BlankSentence
            content={question.content}
            render={(i) =>
              review ? (
                <span style={{ display: 'inline-block', minWidth: 60, padding: '0 8px', margin: '0 2px', borderBottom: `2px solid ${ok(i) ? GREEN : RED}`, color: ok(i) ? GREEN : RED, fontWeight: 600, lineHeight: 1.6 }}>
                  {String(given[i] ?? '').trim() || '…'}
                </span>
              ) : (
                <span style={{ display: 'inline-block', padding: '0 8px', margin: '0 2px', borderBottom: `2px solid ${GREEN}`, color: GREEN, fontWeight: 600, lineHeight: 1.6 }}>{(accepted[i] ?? []).join(' / ')}</span>
              )
            }
          />
          {review && hasKey && (
            <Line label="Đáp án">
              {accepted.map((b, i) => (
                <span key={i} style={{ marginRight: 12 }}>
                  ({i + 1}) <b>{b.join(' / ')}</b>
                </span>
              ))}
            </Line>
          )}
        </>
      );
    }
    case 'SHORT_ANSWER':
    case 'NUMERIC':
    case 'ESSAY': {
      const value = question.type === 'NUMERIC' ? mine.value : mine.text;
      const keyText = question.type === 'SHORT_ANSWER' ? (Array.isArray(key.accepted) ? key.accepted.join(' / ') : '') : question.type === 'NUMERIC' ? (key.tolerance ? `${key.value} (sai số ± ${key.tolerance})` : String(key.value ?? '')) : '';
      return (
        <>
          <QuestionText content={question.content} />
          {review &&
            (question.type === 'ESSAY' ? (
              answered && String(value ?? '').trim() ? (
                <div style={{ whiteSpace: 'pre-wrap', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>{String(value)}</div>
              ) : (
                <NoAnswer />
              )
            ) : (
              <Line label={`${who} trả lời`}>{answered && String(value ?? '').trim() ? <b>{String(value)}</b> : <NoAnswer />}</Line>
            ))}
          {hasKey && keyText && (
            <Line label={question.type === 'SHORT_ANSWER' ? 'Đáp án chấp nhận' : 'Đáp án'}>
              <b>{keyText}</b>
            </Line>
          )}
          {!review && question.type === 'ESSAY' && <Typography.Text type="secondary">Câu tự luận do giáo viên chấm.</Typography.Text>}
        </>
      );
    }
    case 'MATCHING': {
      const m = matching(question.options);
      const want = rec(key.pairs);
      const got = rec(mine.pairs);
      const rightText = (k: unknown) => m.right.find((r) => r.key === k)?.text;
      return (
        <>
          <QuestionText content={question.content} />
          <div style={{ display: 'grid', gap: 6 }}>
            {m.left.map((l, i) => {
              const ok = got[l.key] === want[l.key];
              return (
                <div key={l.key} style={review ? row(ok ? '#86efac' : '#fca5a5', ok ? '#f0fdf4' : '#fef2f2') : row('#e5e7eb', '#fff')}>
                  <b>{i + 1}.</b>
                  <span style={{ flex: 1 }}>{l.text}</span>
                  <span style={{ flex: 1 }}>
                    {review ? (
                      <>
                        → {rightText(got[l.key]) ?? <NoAnswer />} {!ok && hasKey && <Typography.Text type="secondary">(đúng: {rightText(want[l.key])})</Typography.Text>}
                      </>
                    ) : (
                      <>→ {rightText(want[l.key])}</>
                    )}
                  </span>
                  {review && <Mark ok={ok} />}
                </div>
              );
            })}
          </div>
        </>
      );
    }
    case 'ORDERING': {
      const items = choices(question.options);
      const text = (k: string) => items.find((o) => o.key === k)?.text ?? k;
      const want: string[] = Array.isArray(key.order) ? key.order : [];
      const got: string[] = Array.isArray(mine.order) ? mine.order : [];
      const list = (order: string[], marks: boolean) => (
        <ol style={{ margin: '4px 0 0', paddingLeft: 22 }}>
          {order.map((k, i) => (
            <li key={k} style={{ color: marks ? (want[i] === k ? GREEN : RED) : undefined }}>
              {text(k)}
            </li>
          ))}
        </ol>
      );
      return (
        <>
          <QuestionText content={question.content} />
          {review && <Line label={`Thứ tự ${who.toLowerCase()} chọn`}>{got.length ? list(got, true) : <NoAnswer />}</Line>}
          {hasKey && <Line label="Thứ tự đúng">{list(want, false)}</Line>}
        </>
      );
    }
    default:
      return <QuestionText content={question.content} />;
  }
}

/** ✓ / ✗ / partial / waiting icon and the points of one graded question. */
export function PointsTag({ points, max, correct, manual, pending }: { points: number | null; max: number; correct: boolean | null; manual?: boolean; pending?: boolean }) {
  if (pending || points === null) return <Tag color="orange">Chờ chấm · tối đa {max}</Tag>;
  const color = correct ? 'green' : points > 0 ? 'gold' : 'red';
  return (
    <Tag color={color}>
      {points.toLocaleString('vi-VN')} / {max.toLocaleString('vi-VN')} điểm{manual ? ' · GV chấm' : ''}
    </Tag>
  );
}

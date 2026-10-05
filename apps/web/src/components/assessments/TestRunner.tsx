'use client';

import { ClockCircleOutlined, CloudSyncOutlined, ExclamationCircleOutlined, FlagFilled, FlagOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { App, Button, Card, Grid, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { QUESTION_TYPE } from '@/lib/labels';
import { AttemptResultData } from './AttemptResult';
import { AnswerWidget } from './AnswerWidget';
import { clock, isAnswered, score, ShownQuestion } from './model';

export interface AttemptPayload {
  attempt: { id: string; testId: string; attemptNo: number; status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'; startedAt: string; endsAt: string | null; remainingSec: number | null; answers: Record<string, unknown> };
  test: { id: string; title: string; kind: string; timeLimitMin: number | null; showResults: boolean; questionCount: number };
  questions: (ShownQuestion & { index: number; points: number })[];
}

const SAVE_DELAY = 1200;
const RETRY_DELAY = 5000;

function Navigator({ questions, answers, current, flagged, onPick }: { questions: AttemptPayload['questions']; answers: Record<string, unknown>; current: number; flagged: Set<string>; onPick: (i: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: 6 }}>
      {questions.map((q, i) => {
        const done = isAnswered(q.type, answers[q.id]);
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`Câu ${i + 1}${done ? ', đã trả lời' : ''}${flagged.has(q.id) ? ', đánh dấu xem lại' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            style={{
              position: 'relative',
              height: 36,
              borderRadius: 6,
              border: i === current ? '2px solid #1e3a8a' : '1px solid #d1d5db',
              background: done ? '#1d4ed8' : '#fff',
              color: done ? '#fff' : '#111827',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {i + 1}
            {flagged.has(q.id) && <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 5, background: '#f97316', border: '1px solid #fff' }} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Takes one attempt: a question at a time with a navigator, autosave after each change,
 * a countdown that hands the test in when time runs out, and a confirmed manual submit.
 */
export function TestRunner({ payload, onSubmitted }: { payload: AttemptPayload; onSubmitted: (result: AttemptResultData) => void }) {
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const wide = !!screens.md;
  const attemptId = payload.attempt.id;
  const questions = payload.questions;
  const n = questions.length;

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => ({ ...payload.attempt.answers }));
  const answersRef = useRef(answers);
  const dirty = useRef(new Set<string>());
  const [current, setCurrent] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submittingUi, setSubmittingUi] = useState(false);
  const submitting = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warned = useRef(false);

  // The deadline is fixed against this device's clock when the attempt loads, so a skewed clock does not matter.
  const deadline = useMemo(() => (payload.attempt.remainingSec === null ? null : Date.now() + payload.attempt.remainingSec * 1000), [payload]);
  const [now, setNow] = useState(() => Date.now());
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

  async function flush() {
    if (!dirty.current.size || submitting.current) return;
    const ids = [...dirty.current];
    const sent = ids.map((id) => answersRef.current[id]);
    setSaveState('saving');
    try {
      await api(`/student/attempts/${attemptId}/answers`, { method: 'PUT', body: { answers: Object.fromEntries(ids.map((id, i) => [id, sent[i] ?? null])) } });
      ids.forEach((id, i) => {
        if (answersRef.current[id] === sent[i]) dirty.current.delete(id);
      });
      setSavedAt(new Date());
      setSaveState(dirty.current.size ? 'idle' : 'saved');
    } catch (e) {
      setSaveState('error');
      // 400: the time (plus grace) is over or the attempt was handed in elsewhere; submitting returns the result.
      if (e instanceof ApiError && e.status === 400) void submitRef.current(true);
      else {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flushRef.current(), RETRY_DELAY);
      }
    }
  }

  async function submit(auto: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setSubmittingUi(true);
    clearTimeout(saveTimer.current);
    const body: Record<string, unknown> = { ...answersRef.current };
    for (const id of dirty.current) if (!(id in body)) body[id] = null;
    try {
      const result = await api<AttemptResultData>(`/student/attempts/${attemptId}/submit`, { method: 'POST', body: { answers: body } });
      dirty.current.clear();
      if (auto) message.info('Đã hết giờ, bài làm được nộp tự động');
      else message.success('Đã nộp bài');
      onSubmitted(result);
    } catch (e) {
      submitting.current = false;
      setSubmittingUi(false);
      message.error(`Chưa nộp được bài: ${(e as Error).message}`);
      if (auto) setTimeout(() => void submitRef.current(true), RETRY_DELAY);
    }
  }

  // Timers and listeners call the latest closures through refs.
  const flushRef = useRef(flush);
  const submitRef = useRef(submit);
  flushRef.current = flush;
  submitRef.current = submit;

  function setAnswer(id: string, value: unknown) {
    const next = { ...answersRef.current };
    if (value === null || value === undefined) delete next[id];
    else next[id] = value;
    answersRef.current = next;
    setAnswers(next);
    dirty.current.add(id);
    setSaveState('idle');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY);
  }

  // Countdown, the one-minute warning and the automatic hand-in.
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  useEffect(() => {
    if (remaining === null) return;
    if (remaining === 0) void submitRef.current(true);
    else if (remaining <= 60 && !warned.current) {
      warned.current = true;
      message.warning('Còn 1 phút. Bài sẽ tự nộp khi hết giờ.');
    }
  }, [remaining, message]);

  // Save when the tab is hidden, warn before closing with unsaved answers, save on leaving the page.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flushRef.current();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size && !submitting.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      clearTimeout(saveTimer.current);
      if (dirty.current.size && !submitting.current) void flushRef.current();
    };
  }, []);

  const answeredCount = questions.filter((q) => isAnswered(q.type, answers[q.id])).length;

  function confirmSubmit() {
    const left = n - answeredCount;
    modal.confirm({
      title: 'Nộp bài?',
      icon: <ExclamationCircleOutlined />,
      content: (
        <>
          Em đã trả lời {answeredCount}/{n} câu.
          {left > 0 && (
            <>
              <br />
              <b style={{ color: '#dc2626' }}>Còn {left} câu chưa trả lời.</b>
            </>
          )}
          {flagged.size > 0 && (
            <>
              <br />
              Có {flagged.size} câu em đánh dấu xem lại.
            </>
          )}
          <br />
          Sau khi nộp em không sửa được bài làm.
        </>
      ),
      okText: 'Nộp bài',
      cancelText: 'Làm tiếp',
      onOk: () => submitRef.current(false),
    });
  }

  const go = (i: number) => {
    setCurrent(Math.max(0, Math.min(n - 1, i)));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleFlag = (id: string) =>
    setFlagged((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = questions[current];
  const saveText =
    saveState === 'saving' ? 'Đang lưu…' : saveState === 'error' ? 'Chưa lưu được, đang thử lại…' : savedAt ? `Đã lưu lúc ${savedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Câu trả lời được lưu tự động';
  const navigator = <Navigator questions={questions} answers={answers} current={current} flagged={flagged} onPick={go} />;
  const legend = (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#6b7280', marginTop: 8 }}>
      <span>
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1d4ed8', borderRadius: 2, marginRight: 4 }} />
        Đã trả lời
      </span>
      <span>
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#f97316', borderRadius: 5, marginRight: 4 }} />
        Xem lại
      </span>
    </div>
  );

  const card = q ? (
    <Card
      size="small"
      title={
        <Space wrap size={6}>
          <span>
            Câu {current + 1}/{n}
          </span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
            {QUESTION_TYPE[q.type]} · {score(q.points)} điểm
          </Typography.Text>
        </Space>
      }
      extra={
        <Button size="small" icon={flagged.has(q.id) ? <FlagFilled style={{ color: '#f97316' }} /> : <FlagOutlined />} onClick={() => toggleFlag(q.id)}>
          {flagged.has(q.id) ? 'Bỏ đánh dấu' : 'Xem lại sau'}
        </Button>
      }
    >
      <AnswerWidget key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} disabled={submittingUi} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20 }}>
        <Button icon={<LeftOutlined />} disabled={current === 0} onClick={() => go(current - 1)}>
          Câu trước
        </Button>
        {current < n - 1 ? (
          <Button type="primary" onClick={() => go(current + 1)}>
            Câu tiếp <RightOutlined />
          </Button>
        ) : (
          <Button type="primary" onClick={confirmSubmit} loading={submittingUi}>
            Nộp bài
          </Button>
        )}
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 49,
          zIndex: 9,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          margin: '-12px -12px 12px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payload.test.title}</div>
          <div style={{ fontSize: 12, color: saveState === 'error' ? '#dc2626' : '#6b7280' }}>
            <CloudSyncOutlined /> {saveText}
          </div>
        </div>
        {remaining !== null && (
          <Tag icon={<ClockCircleOutlined />} color={remaining <= 60 ? 'red' : remaining <= 300 ? 'orange' : 'blue'} style={{ fontSize: 16, padding: '4px 8px', margin: 0, fontVariantNumeric: 'tabular-nums' }} aria-label="Thời gian còn lại">
            {clock(remaining)}
          </Tag>
        )}
        <Button type="primary" onClick={confirmSubmit} loading={submittingUi}>
          Nộp bài
        </Button>
      </div>
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 12, alignItems: 'start' }}>
          {card}
          <Card size="small" title={`Đã làm ${answeredCount}/${n} câu`} style={{ position: 'sticky', top: 116 }}>
            {navigator}
            {legend}
          </Card>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Đã làm {answeredCount}/{n} câu
            </Typography.Text>
            <div style={{ marginTop: 6 }}>{navigator}</div>
          </Card>
          {card}
        </div>
      )}
    </div>
  );
}

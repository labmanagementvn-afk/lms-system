'use client';

import { DownloadOutlined, FilePdfOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, Dropdown, Empty, Input, InputNumber, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { downloadCsv, downloadFile } from './download';
import { ImportBookButton } from './ImportBookButton';
import { fmtMark, PassedTag } from './ResultLevelTag';

export interface BookStudent {
  id: string;
  code: string;
  fullName: string;
  marks: { TX: (number | null)[]; GK: number | null; CK: number | null };
  passed: { TX: (boolean | null)[]; GK: boolean | null; CK: boolean | null };
  average: number | null;
  passedResult: boolean | null;
  note: string | null;
  exempt?: boolean;
}

export interface Book {
  class: { id: string; name: string; gradeLevel: number; academicYearId: string };
  subject: { id: string; code: string; name: string };
  semester: number;
  setting: { assessment: 'SCORE' | 'COMMENT'; regularCount: number };
  locked: boolean;
  lockedColumns?: { kind: 'TX' | 'GK' | 'CK'; index: number }[];
  window?: { opensAt: string | null; closesAt: string | null; maxEdits: number | null };
  /** Phân công giảng dạy: once the semester has assignments, only the assigned teachers (and the office) write the marks. */
  assignment?: { recorded: boolean; teachers: string[]; mine: boolean };
  students: BookStudent[];
}

type Kind = 'TX' | 'GK' | 'CK';
type Slot = { kind: Kind; index: number; label: string };
type CellValue = number | boolean | null;

const cellKey = (studentId: string, slot: Slot) => `${studentId}|${slot.kind}|${slot.index}`;
const round1 = (x: number) => Math.round((x + Number.EPSILON) * 10) / 10;

/** Mirrors the server's TT22 average so the sheet updates as the teacher types. */
function liveOutcome(values: CellValue[], gk: CellValue, ck: CellValue, comment: boolean): { average: number | null; passed: boolean | null } {
  if (comment) {
    if (gk === null || ck === null) return { average: null, passed: null };
    return { average: null, passed: gk === true && ck === true && values.every((v) => v !== false) };
  }
  if (values.some((v) => v === null) || gk === null || ck === null) return { average: null, passed: null };
  const sum = values.reduce<number>((a, v) => a + (v as number), 0) + 2 * (gk as number) + 3 * (ck as number);
  return { average: round1(sum / (values.length + 5)), passed: null };
}

/** Sổ điểm of one class, subject and semester; edits stay local until "Lưu". */
export function GradeSheet({ classId, subjectId, semester }: { classId?: string; subjectId?: string; semester: number }) {
  const { message } = App.useApp();
  const ready = !!classId && !!subjectId;
  const { data, isLoading, mutate } = useSWR<Book>(ready ? ['/grades/book', { classId, subjectId, semester }] : null);
  const [draft, setDraft] = useState<Record<string, CellValue>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'export' | 'xlsx' | 'pdf' | null>(null);

  useEffect(() => {
    setDraft({});
    setNotes({});
  }, [classId, subjectId, semester]);

  const comment = data?.setting.assessment === 'COMMENT';
  const slots = useMemo<Slot[]>(() => {
    const n = data?.setting.regularCount ?? 0;
    return [...Array.from({ length: n }, (_, i) => ({ kind: 'TX' as Kind, index: i + 1, label: `TX${i + 1}` })), { kind: 'GK', index: 1, label: 'GK' }, { kind: 'CK', index: 1, label: 'CK' }];
  }, [data?.setting.regularCount]);

  const stored = (s: BookStudent, slot: Slot): CellValue => {
    if (comment) return slot.kind === 'TX' ? (s.passed.TX[slot.index - 1] ?? null) : s.passed[slot.kind];
    return slot.kind === 'TX' ? (s.marks.TX[slot.index - 1] ?? null) : s.marks[slot.kind];
  };
  const current = (s: BookStudent, slot: Slot): CellValue => {
    const k = cellKey(s.id, slot);
    return k in draft ? draft[k] : stored(s, slot);
  };
  const noteOf = (s: BookStudent) => (s.id in notes ? notes[s.id] : (s.note ?? ''));
  const isDirty = (s: BookStudent) => slots.some((slot) => cellKey(s.id, slot) in draft && draft[cellKey(s.id, slot)] !== stored(s, slot)) || (s.id in notes && notes[s.id].trim() !== (s.note ?? ''));
  const changedCount = useMemo(() => {
    let n = 0;
    for (const s of data?.students ?? []) {
      for (const slot of slots) if (cellKey(s.id, slot) in draft && draft[cellKey(s.id, slot)] !== stored(s, slot)) n++;
      if (s.id in notes && notes[s.id].trim() !== (s.note ?? '')) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draft, notes, slots]);

  const setCell = (s: BookStudent, slot: Slot, value: CellValue) => setDraft((d) => ({ ...d, [cellKey(s.id, slot)]: value }));

  // Enter / arrows move down and up the same column; Tab moves across as usual.
  const onKey = (row: number, col: number) => (e: KeyboardEvent) => {
    const delta = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + delta}-${col}"] input`);
    next?.focus();
    next?.select();
  };

  async function save() {
    if (!data) return;
    const entries: Record<string, unknown>[] = [];
    for (const s of data.students) {
      const byKey = new Map<string, Record<string, unknown>>();
      for (const slot of slots) {
        const k = cellKey(s.id, slot);
        if (!(k in draft) || draft[k] === stored(s, slot)) continue;
        byKey.set(k, { studentId: s.id, kind: slot.kind, index: slot.index, [comment ? 'passed' : 'value']: draft[k] });
      }
      if (s.id in notes && notes[s.id].trim() !== (s.note ?? '')) {
        const k = `${s.id}|CK|1`;
        byKey.set(k, { ...(byKey.get(k) ?? { studentId: s.id, kind: 'CK', index: 1 }), note: notes[s.id].trim() || null });
      }
      entries.push(...byKey.values());
    }
    if (!entries.length) return;
    setBusy('save');
    try {
      const res = await api<Book>('/grades/book', { method: 'PUT', body: { classId, subjectId, semester, entries } });
      await mutate(res, { revalidate: false });
      setDraft({});
      setNotes({});
      message.success(`Đã lưu ${entries.length} thay đổi`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    if (!data) return;
    setBusy('export');
    try {
      await downloadCsv('/grades/book/export', { classId, subjectId, semester }, `so-diem-${data.subject.code}-${data.class.name}-HK${semester}.csv`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    if (!data) return;
    setBusy(format);
    try {
      await downloadFile('/reports/subject-scores', { classId, subjectId, semester, format }, `bang-diem-${data.subject.code}-${data.class.name.replace(/\W+/g, '-')}-HK${semester}.${format}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <Empty description="Chọn lớp và môn học để nhập điểm" style={{ marginTop: 48 }} />;

  // Read-only for a teacher who is not assigned to the subject in the class.
  const notAssigned = !!data?.assignment && !data.assignment.mine;
  const locked = !!data?.locked || notAssigned;
  const columnLocked = (slot: Slot) => !!data?.lockedColumns?.some((c) => c.kind === slot.kind && c.index === slot.index);
  const now = Date.now();
  const outsideWindow = !!data?.window && ((data.window.opensAt && now < Date.parse(data.window.opensAt)) || (data.window.closesAt && now > Date.parse(data.window.closesAt)));
  const editor = (s: BookStudent, slot: Slot, row: number, col: number) => {
    if (s.exempt) return <Tag>MG</Tag>;
    const disabled = locked || columnLocked(slot);
    const v = current(s, slot);
    const dirty = cellKey(s.id, slot) in draft && draft[cellKey(s.id, slot)] !== stored(s, slot);
    const style = dirty ? { background: '#fef3c7' } : undefined;
    if (comment) {
      return (
        <span data-cell={`${row}-${col}`}>
          <Select<string>
            size="small"
            value={v === null ? null : v ? 'D' : 'CD'}
            allowClear
            placeholder="—"
            disabled={disabled}
            style={{ width: 72, ...style }}
            options={[
              { value: 'D', label: 'Đ' },
              { value: 'CD', label: 'CĐ' },
            ]}
            onChange={(val) => setCell(s, slot, val === undefined || val === null ? null : val === 'D')}
          />
        </span>
      );
    }
    return (
      <span data-cell={`${row}-${col}`}>
        <InputNumber
          size="small"
          min={0}
          max={10}
          step={0.1}
          precision={1}
          controls={false}
          disabled={disabled}
          value={v as number | null}
          style={{ width: 64, ...style }}
          onChange={(val) => setCell(s, slot, val === null || val === undefined ? null : round1(Number(val)))}
          onKeyDown={onKey(row, col)}
        />
      </span>
    );
  };

  const columns: ColumnsType<BookStudent> = [
    { title: '#', width: 44, render: (_, __, i) => i + 1 },
    { title: 'Mã HS', dataIndex: 'code', width: 110 },
    { title: 'Họ và tên', dataIndex: 'fullName', width: 200, fixed: 'left', render: (v: string) => <b>{v}</b> },
    ...slots.map<ColumnsType<BookStudent>[number]>((slot, col) => ({
      title: columnLocked(slot) ? (
        <Tooltip title="Cột điểm đã khóa">
          <span>
            <LockOutlined /> {slot.label}
          </span>
        </Tooltip>
      ) : slot.kind === 'TX' ? (
        slot.label
      ) : (
        <b>{slot.label}</b>
      ),
      width: comment ? 90 : 80,
      align: 'center',
      render: (_, s, row) => editor(s, slot, row, col),
    })),
    {
      title: comment ? 'Kết quả' : 'ĐTB',
      width: 90,
      align: 'center',
      render: (_, s) => {
        if (s.exempt) return <Tag color="blue">Miễn học</Tag>;
        const o = liveOutcome(
          slots.filter((x) => x.kind === 'TX').map((x) => current(s, x)),
          current(s, slots[slots.length - 2]),
          current(s, slots[slots.length - 1]),
          !!comment,
        );
        if (comment) return <PassedTag passed={o.passed} />;
        return <b style={{ color: o.average !== null && o.average < 5 ? '#dc2626' : undefined }}>{fmtMark(o.average)}</b>;
      },
    },
    {
      title: 'Nhận xét',
      render: (_, s) => <Input size="small" value={noteOf(s)} maxLength={500} disabled={locked} placeholder="Nhận xét cuối kỳ" onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />,
    },
  ];

  return (
    <>
      {notAssigned && data && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 12 }}
          message={`Bạn không được phân công dạy ${data.subject.name} ở lớp ${data.class.name} trong học kỳ này: chỉ xem sổ điểm.`}
          description={data.assignment!.teachers.length ? `Giáo viên được phân công: ${data.assignment!.teachers.join(', ')}.` : 'Môn này của lớp chưa được phân công giáo viên.'}
        />
      )}
      {!!data?.locked && <Alert type="warning" showIcon icon={<LockOutlined />} style={{ marginBottom: 12 }} message="Sổ điểm học kỳ này đã khóa. Liên hệ ban giám hiệu để mở khóa trước khi sửa điểm." />}
      {!locked && !!data?.lockedColumns?.length && (
        <Alert type="info" showIcon icon={<LockOutlined />} style={{ marginBottom: 12 }} message={`Các cột đã khóa: ${data.lockedColumns.map((c) => (c.kind === 'TX' ? `TX${c.index}` : c.kind)).join(', ')}`} />
      )}
      {outsideWindow && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Ngoài thời gian nhập điểm của học kỳ: giáo viên không lưu được điểm, văn phòng vẫn nhập được." />
      )}
      <Space wrap style={{ marginBottom: 12 }}>
        {data && (
          <Typography.Text type="secondary">
            {data.subject.name} · Lớp {data.class.name} · {comment ? 'Đánh giá bằng nhận xét (Đ/CĐ)' : `${data.setting.regularCount} điểm thường xuyên, GK hệ số 2, CK hệ số 3`}
            {data.assignment?.recorded && !notAssigned && data.assignment.teachers.length ? ` · Giáo viên: ${data.assignment.teachers.join(', ')}` : ''}
          </Typography.Text>
        )}
        {changedCount > 0 && <Tag color="gold">{changedCount} thay đổi chưa lưu</Tag>}
        <Dropdown
          disabled={!data}
          menu={{
            items: [
              { key: 'xlsx', icon: <DownloadOutlined />, label: 'Excel (nhập lại được)', onClick: () => exportReport('xlsx') },
              { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF có chữ ký', onClick: () => exportReport('pdf') },
              { key: 'csv', icon: <DownloadOutlined />, label: 'CSV', onClick: exportCsv },
            ],
          }}
        >
          <Button icon={<DownloadOutlined />} loading={!!busy && busy !== 'save'}>
            Xuất bảng điểm
          </Button>
        </Dropdown>
        {data && <ImportBookButton classId={data.class.id} subjectId={data.subject.id} semester={semester} disabled={locked} onImported={() => mutate()} />}
        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={busy === 'save'} disabled={!changedCount || locked}>
          Lưu
        </Button>
      </Space>
      <Table<BookStudent>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.students ?? []}
        columns={columns}
        size="small"
        pagination={false}
        scroll={{ x: 900 }}
        onRow={(s) => ({ style: isDirty(s) ? { background: '#fffbeb' } : undefined })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Lớp chưa có học sinh" /> }}
      />
    </>
  );
}

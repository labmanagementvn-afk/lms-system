'use client';

import { FilePdfOutlined, LeftOutlined, PlusOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadFile } from '@/components/grades/download';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses, usePeriods, useSubjects } from '@/lib/hooks';
import { DAY, dmy, SESSION } from '@/lib/labels';
import { CalendarSlot, CalendarWeek } from '@/lib/teaching';

interface Plan {
  lessonNo: number | null;
  title: string;
  aids: string;
  note: string;
}

interface Row {
  key: string;
  date: string;
  dayOfWeek: number;
  /** Rows of the day this row spans in the first column (0 for the day's later rows). */
  span: number;
  slot: CalendarSlot | null;
}

/** A period added by hand this session (dạy bù, dạy thay), not yet saved. */
type ExtraSlot = CalendarSlot & { date: string };

const slotKey = (date: string, periodNumber: number) => `${date}|${periodNumber}`;
/** "Tuần 05/10 – 10/10/2026": Monday to Saturday of the picked week. */
const weekLabel = (v: Dayjs) => {
  const monday = v.subtract((v.day() + 6) % 7, 'day');
  return `Tuần ${monday.format('DD/MM')} – ${monday.add(5, 'day').format('DD/MM/YYYY')}`;
};
const planOf = (s: CalendarSlot): Plan => ({ lessonNo: s.plan?.lessonNo ?? null, title: s.plan?.title ?? '', aids: s.plan?.aids ?? '', note: s.plan?.note ?? '' });
const same = (a: Plan, b: Plan) => a.lessonNo === b.lessonNo && a.title.trim() === b.title.trim() && a.aids.trim() === b.aids.trim() && a.note.trim() === b.note.trim();

/**
 * Lịch báo giảng: the teacher's week from the timetable, where they write the lesson of
 * each period (tiết theo kế hoạch dạy học, tên bài, đồ dùng). The lesson then fills the
 * sổ đầu bài, and the school's leaders read and print every teacher's week.
 */
export default function LessonCalendarPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [teacherId, setTeacherId] = useState<string | undefined>(me?.teacherId ?? undefined);
  const [week, setWeek] = useState<Dayjs>(dayjs());
  const date = week.format('YYYY-MM-DD');
  const { data, isLoading, error, mutate } = useSWR<CalendarWeek>(teacherId ? ['/teaching/calendar', { teacherId, date }] : null);
  const { data: teachers } = useAllTeachers();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: periodList } = usePeriods();
  const [draft, setDraft] = useState<Record<string, Plan>>({});
  const [extra, setExtra] = useState<ExtraSlot[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!teacherId && teachers?.items.length && me?.role !== 'TEACHER') setTeacherId(teachers.items[0].id);
  }, [teacherId, teachers, me]);
  useEffect(() => {
    setExtra([]);
    setDraft(data ? Object.fromEntries(data.days.flatMap((d) => d.slots.map((s) => [slotKey(d.date, s.periodNumber), planOf(s)]))) : {});
  }, [data]);

  const days = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({ ...d, slots: [...d.slots, ...extra.filter((e) => e.date === d.date)].sort((a, b) => a.periodNumber - b.periodNumber) }));
  }, [data, extra]);

  const rows: Row[] = useMemo(
    () =>
      days.flatMap((d): Row[] =>
        d.slots.length
          ? d.slots.map((s, i) => ({ key: slotKey(d.date, s.periodNumber), date: d.date, dayOfWeek: d.dayOfWeek, span: i === 0 ? d.slots.length : 0, slot: s }))
          : [{ key: d.date, date: d.date, dayOfWeek: d.dayOfWeek, span: 1, slot: null }],
      ),
    [days],
  );

  const original = (r: Row): Plan => (r.slot ? planOf(r.slot) : { lessonNo: null, title: '', aids: '', note: '' });
  const changed = rows.filter((r) => r.slot && draft[r.key] && !same(draft[r.key], original(r)));
  const editable = !!data?.editable;
  const set = (key: string, patch: Partial<Plan>) => setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? { lessonNo: null, title: '', aids: '', note: '' }), ...patch } }));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      await api('/teaching/calendar', {
        method: 'PUT',
        body: {
          teacherId: data.teacher.id,
          entries: changed.map((r) => {
            const p = draft[r.key];
            return { date: r.date, periodNumber: r.slot!.periodNumber, classId: r.slot!.class.id, subjectId: r.slot!.subject.id, lessonNo: p.lessonNo ?? null, title: p.title, aids: p.aids || null, note: p.note || null };
          }),
        },
      });
      message.success(`Đã lưu ${changed.length} tiết`);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addPeriod() {
    const v = await form.validateFields();
    const d = v.date.format('YYYY-MM-DD');
    if (days.find((x) => x.date === d)?.slots.some((s) => s.periodNumber === v.periodNumber)) {
      message.warning('Tiết này đã có trong lịch');
      return;
    }
    const klass = classes?.find((c) => c.id === v.classId);
    const subject = subjects?.find((s) => s.id === v.subjectId);
    const p = periodList?.find((x) => x.number === v.periodNumber);
    const slot: ExtraSlot = {
      date: d,
      periodNumber: v.periodNumber,
      class: { id: klass.id, name: klass.name },
      subject: { id: subject.id, code: subject.code, name: subject.name },
      room: null,
      scheduled: false,
      plan: null,
      session: p?.session ?? null,
      startTime: p?.startTime ?? null,
      endTime: p?.endTime ?? null,
    };
    setExtra([...extra, slot]);
    set(slotKey(d, v.periodNumber), { title: v.title ?? '' });
    setAdding(false);
  }

  async function print() {
    setBusy(true);
    try {
      await downloadFile('/reports/lesson-calendar', { teacherId: data?.teacher.id, week: date, format: 'pdf' }, `lich-bao-giang-${data?.week.from ?? date}.pdf`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Long lesson titles and aid lists wrap onto more lines; each stays one line of text.
  const input = (r: Row, field: 'title' | 'aids' | 'note', placeholder?: string) =>
    editable ? (
      <Input.TextArea
        autoSize={{ minRows: 1, maxRows: 4 }}
        value={draft[r.key]?.[field] ?? ''}
        placeholder={placeholder}
        maxLength={300}
        onChange={(e) => set(r.key, { [field]: e.target.value.replace(/\s*\n\s*/g, ' ') })}
        variant="borderless"
        style={{ paddingInline: 0 }}
      />
    ) : (
      draft[r.key]?.[field]
    );

  return (
    <>
      <PageHeader
        title="Lịch báo giảng"
        extra={
          <Space wrap>
            {editable && (
              <Button icon={<PlusOutlined />} onClick={() => (form.resetFields(), form.setFieldsValue({ date: dayjs(data!.week.from) }), setAdding(true))}>
                Thêm tiết dạy bù, dạy thay
              </Button>
            )}
            <Button icon={<FilePdfOutlined />} onClick={print} loading={busy} disabled={!data}>
              In lịch báo giảng
            </Button>
            {editable && (
              <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!changed.length}>
                Lưu{changed.length ? ` (${changed.length} tiết)` : ''}
              </Button>
            )}
          </Space>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Chọn giáo viên"
          style={{ width: 260 }}
          value={teacherId}
          onChange={setTeacherId}
          options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})` }))}
        />
        <Button icon={<LeftOutlined />} onClick={() => setWeek(week.subtract(1, 'week'))} aria-label="Tuần trước" />
        <DatePicker picker="week" value={week} onChange={(v) => v && setWeek(v)} allowClear={false} format={weekLabel} style={{ width: 210 }} />
        <Button icon={<RightOutlined />} onClick={() => setWeek(week.add(1, 'week'))} aria-label="Tuần sau" />
        <Button onClick={() => setWeek(dayjs())}>Tuần này</Button>
      </Space>
      {!teacherId && me?.role === 'TEACHER' && <Alert type="info" showIcon message="Tài khoản chưa gắn với hồ sơ giáo viên: chọn giáo viên để xem lịch." style={{ marginBottom: 12 }} />}
      {error && <Alert type="error" showIcon message={(error as Error).message} style={{ marginBottom: 12 }} />}
      {data && (
        <Typography.Paragraph>
          <b>{data.week.number ? `Tuần ${data.week.number}` : 'Ngoài năm học'}</b>: từ {dmy(data.week.from)} đến {dmy(data.week.to)} · {data.teacher.fullName} · {data.periods} tiết theo thời khóa biểu ·{' '}
          <Tag color={data.planned >= data.periods && data.periods ? 'green' : 'orange'}>đã báo giảng {data.planned} tiết</Tag>
          {!editable && <Tag>Chỉ xem</Tag>}
        </Typography.Paragraph>
      )}
      <Table<Row>
        rowKey="key"
        size="small"
        bordered
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          {
            title: 'Thứ, ngày',
            width: 110,
            onCell: (r) => ({ rowSpan: r.span }),
            render: (_, r) => (
              <>
                <b>{DAY[r.dayOfWeek]}</b>
                <div>{dmy(r.date)}</div>
              </>
            ),
          },
          {
            title: 'Tiết',
            width: 110,
            onCell: (r) => (r.slot ? {} : { colSpan: 7 }),
            render: (_, r) =>
              r.slot ? (
                <>
                  {r.slot.session ? `${SESSION[r.slot.session]} · ` : ''}Tiết {r.slot.periodNumber}
                  {r.slot.startTime && (
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {r.slot.startTime}–{r.slot.endTime}
                    </Typography.Text>
                  )}
                </>
              ) : (
                <Typography.Text type="secondary">Không có tiết dạy</Typography.Text>
              ),
          },
          {
            title: 'Lớp',
            width: 70,
            onCell: (r) => (r.slot ? {} : { colSpan: 0 }),
            render: (_, r) => r.slot && (
              <>
                {r.slot.class.name}
                {!r.slot.scheduled && <Tag color="purple" style={{ marginLeft: 4 }}>Bù</Tag>}
              </>
            ),
          },
          { title: 'Môn', width: 130, onCell: (r) => (r.slot ? {} : { colSpan: 0 }), render: (_, r) => r.slot?.subject.name },
          {
            title: 'Tiết PPCT',
            width: 90,
            onCell: (r) => (r.slot ? {} : { colSpan: 0 }),
            render: (_, r) =>
              r.slot &&
              (editable ? (
                <InputNumber size="small" min={1} max={500} value={draft[r.key]?.lessonNo ?? null} onChange={(v) => set(r.key, { lessonNo: v ?? null })} variant="borderless" style={{ width: '100%' }} aria-label="Tiết theo kế hoạch dạy học" />
              ) : (
                draft[r.key]?.lessonNo
              )),
          },
          { title: 'Tên bài dạy', onCell: (r) => (r.slot ? {} : { colSpan: 0 }), render: (_, r) => r.slot && input(r, 'title', 'Bài, nội dung dạy') },
          { title: 'Đồ dùng dạy học', width: 220, onCell: (r) => (r.slot ? {} : { colSpan: 0 }), render: (_, r) => r.slot && input(r, 'aids') },
          { title: 'Ghi chú', width: 180, onCell: (r) => (r.slot ? {} : { colSpan: 0 }), render: (_, r) => r.slot && input(r, 'note') },
        ]}
      />
      <Modal title="Thêm tiết dạy bù, dạy thay" open={adding} onOk={addPeriod} onCancel={() => setAdding(false)} okText="Thêm" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="date" label="Ngày" rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" disabledDate={(d) => !!data && (d.isBefore(dayjs(data.week.from), 'day') || d.isAfter(dayjs(data.week.from).add(6, 'day'), 'day'))} />
            </Form.Item>
            <Form.Item name="periodNumber" label="Tiết" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={(periodList ?? []).map((p) => ({ value: p.number, label: `${SESSION[p.session] ?? ''} · Tiết ${p.number}` }))} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="classId" label="Lớp" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} showSearch optionFilterProp="label" options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="subjectId" label="Môn" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Space>
          <Form.Item name="title" label="Tên bài dạy" rules={[{ required: true, message: 'Nhập tên bài dạy' }]}>
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

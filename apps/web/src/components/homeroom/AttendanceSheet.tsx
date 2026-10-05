'use client';

import { CheckCircleOutlined, CloudDownloadOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Empty, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DAY_STATUS, HOMEROOM_STATUS } from '@/lib/labels';
import { formatTime } from '@/lib/time';

type Draft = { status: string | null; note: string };
type ButtonColor = 'green' | 'red' | 'orange' | 'blue' | 'default';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

/** One-tap roll-call status: the chosen status lights up in its own colour. */
export function StatusButtons({ value, onChange }: { value: string | null; onChange: (status: string) => void }) {
  return (
    <Space.Compact size="small">
      {STATUSES.map((s) => (
        <Button
          key={s}
          color={value === s ? (HOMEROOM_STATUS[s].color as ButtonColor) : 'default'}
          variant={value === s ? 'solid' : 'outlined'}
          onClick={() => onChange(s)}
        >
          {HOMEROOM_STATUS[s].label}
        </Button>
      ))}
    </Space.Compact>
  );
}

/** The roll-call sheet of one class for one day: edits stay local until "Lưu". */
export function AttendanceSheet({ classId, date }: { classId?: string; date: string }) {
  const { message, modal } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { data, isLoading, mutate } = useSWR<any>(classId ? ['/homeroom/attendance', { classId, date }] : null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<'save' | 'prefill' | null>(null);

  useEffect(() => setDraft({}), [classId, date]);

  const rows: any[] = useMemo(() => data?.rows ?? [], [data]);
  const current = (r: any): Draft => draft[r.student.id] ?? { status: r.status, note: r.note ?? '' };
  const isDirty = (r: any) => {
    const d = draft[r.student.id];
    return !!d && (d.status !== r.status || d.note.trim() !== (r.note ?? ''));
  };
  const changed = rows.filter(isDirty);
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, unmarked: 0 };
  for (const r of rows) {
    const s = current(r).status as keyof typeof counts | null;
    if (s) counts[s]++;
    else counts.unmarked++;
  }

  const update = (r: any, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [r.student.id]: { ...(d[r.student.id] ?? { status: r.status, note: r.note ?? '' }), ...patch } }));
  const markRestPresent = () =>
    setDraft((d) => {
      const next = { ...d };
      for (const r of rows) {
        const cur = next[r.student.id] ?? { status: r.status, note: r.note ?? '' };
        if (!cur.status) next[r.student.id] = { ...cur, status: 'PRESENT' };
      }
      return next;
    });

  async function save() {
    const records = changed
      .filter((r) => current(r).status)
      .map((r) => ({ studentId: r.student.id, status: current(r).status, note: current(r).note.trim() || undefined }));
    if (!records.length) return;
    setBusy('save');
    try {
      const res = await api('/homeroom/attendance', { method: 'PUT', body: { classId, date, records } });
      await mutate(res, { revalidate: false });
      setDraft({});
      message.success(`Đã lưu điểm danh ${records.length} học sinh`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function prefill() {
    const run = async () => {
      setBusy('prefill');
      try {
        const res = await api('/homeroom/attendance/prefill', { method: 'POST', body: { classId, date } });
        await mutate(res, { revalidate: false });
        setDraft({});
        message.success('Đã điền trạng thái cho học sinh chưa điểm danh theo dữ liệu cổng');
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    };
    if (changed.length) {
      modal.confirm({
        title: 'Bỏ các thay đổi chưa lưu?',
        content: 'Điền từ dữ liệu cổng sẽ tải lại bảng điểm danh; những thay đổi chưa lưu sẽ mất.',
        okText: 'Tiếp tục',
        cancelText: 'Hủy',
        onOk: run,
      });
    } else await run();
  }

  if (!classId) return <Empty description="Chọn lớp để điểm danh" />;

  return (
    <>
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color="green">Có mặt {counts.PRESENT}</Tag>
        <Tag color="red">Vắng {counts.ABSENT}</Tag>
        <Tag color="orange">Đi muộn {counts.LATE}</Tag>
        <Tag color="blue">Có phép {counts.EXCUSED}</Tag>
        <Tag>Chưa điểm danh {counts.unmarked}</Tag>
        {data && (
          <Typography.Text type="secondary">
            Sĩ số {data.summary.total} · đi muộn sau {data.lateAfter}
          </Typography.Text>
        )}
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Tooltip title="Học sinh chưa điểm danh: đã vào cổng → Có mặt / Đi muộn, chưa vào cổng → Vắng">
          <Button icon={<CloudDownloadOutlined />} onClick={prefill} loading={busy === 'prefill'} disabled={!data?.summary.unmarked}>
            Điền từ dữ liệu cổng
          </Button>
        </Tooltip>
        <Button icon={<CheckCircleOutlined />} onClick={markRestPresent} disabled={!counts.unmarked}>
          Còn lại có mặt
        </Button>
        {changed.length > 0 && <Tag color="gold">{changed.length} thay đổi chưa lưu</Tag>}
        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={busy === 'save'} disabled={!changed.length}>
          Lưu
        </Button>
      </Space>
      <Table<any>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={rows}
        size="small"
        pagination={false}
        scroll={{ x: 1000 }}
        onRow={(r) => ({ style: isDirty(r) ? { background: '#fffbeb' } : undefined })}
        columns={[
          { title: '#', width: 50, render: (_, __, i) => i + 1 },
          { title: 'Mã', width: 110, render: (_, r) => r.student.code },
          { title: 'Họ và tên', width: 200, render: (_, r) => <b>{r.student.fullName}</b> },
          {
            title: 'Cổng trường',
            width: 170,
            render: (_, r) => (
              <Space size={4}>
                <Tag color={DAY_STATUS[r.gate.status].color} style={{ margin: 0 }}>
                  {DAY_STATUS[r.gate.status].label}
                </Tag>
                {r.gate.firstIn && <span style={{ color: '#64748b' }}>{formatTime(r.gate.firstIn, tz)}</span>}
              </Space>
            ),
          },
          { title: 'Điểm danh', width: 340, render: (_, r) => <StatusButtons value={current(r).status} onChange={(status) => update(r, { status })} /> },
          {
            title: 'Ghi chú',
            render: (_, r) => <Input size="small" value={current(r).note} placeholder="Lý do, ghi chú gửi phụ huynh" maxLength={255} onChange={(e) => update(r, { note: e.target.value })} />,
          },
        ]}
      />
    </>
  );
}

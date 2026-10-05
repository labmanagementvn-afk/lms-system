'use client';

import { InputNumber, Select, Tag } from 'antd';
import type { InputNumberProps } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { CSSProperties, useState } from 'react';
import useSWR from 'swr';
import { EMPLOYEE_STATUS, LEAVE_STATUS } from '@/lib/labels';

export const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');
export const fmtDateTime = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '');
export const isoDate = (d?: Dayjs | null) => d?.format('YYYY-MM-DD');
export const employeeLabel = (e: any) => `${e.code} · ${e.fullName}${e.department ? ` (${e.department})` : ''}`;

/** Same rule as the API: calendar days from `from` to `to` inclusive, Saturdays and Sundays excluded. */
export function workingDays(from?: Dayjs | null, to?: Dayjs | null): number {
  if (!from || !to || to.isBefore(from, 'day')) return 0;
  let n = 0;
  for (let d = from.startOf('day'); !d.isAfter(to, 'day'); d = d.add(1, 'day')) if (d.day() !== 0 && d.day() !== 6) n++;
  return n;
}

/** Expiry tag: red once past, orange within 30 days, green otherwise; grey without an expiry date. */
export function ExpiryTag({ date, daysLeft }: { date?: string | null; daysLeft?: number | null }) {
  if (!date) return <Tag>Không thời hạn</Tag>;
  const left = daysLeft ?? dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (left < 0) return <Tag color="red">Hết hạn {-left} ngày</Tag>;
  if (left === 0) return <Tag color="red">Hết hạn hôm nay</Tag>;
  if (left <= 30) return <Tag color="orange">Còn {left} ngày</Tag>;
  return <Tag color="green">{fmtDate(date)}</Tag>;
}

export const EmployeeStatusTag = ({ status }: { status: string }) => <Tag color={EMPLOYEE_STATUS[status]?.color}>{EMPLOYEE_STATUS[status]?.label ?? status}</Tag>;
export const LeaveStatusTag = ({ status }: { status: string }) => <Tag color={LEAVE_STATUS[status]?.color}>{LEAVE_STATUS[status]?.label ?? status}</Tag>;

/** VND amount input with thousand separators. */
export function MoneyInput(props: InputNumberProps<number>) {
  return (
    <InputNumber<number>
      min={0}
      step={100000}
      style={{ width: 180 }}
      formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
      parser={(v) => Number((v ?? '').replace(/\./g, ''))}
      {...props}
    />
  );
}

/** Employee picker with server-side search by name or code; `initial` keeps the current choice visible before it is searched for. */
export function EmployeeSelect({
  value,
  onChange,
  style,
  placeholder,
  disabled,
  initial,
}: {
  value?: string;
  onChange?: (id?: string) => void;
  style?: CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  initial?: { value: string; label: string };
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useSWR<{ items: any[] }>(['/hr/employees', { q, pageSize: 20 }]);
  const opts = data?.items.map((e) => ({ value: e.id, label: employeeLabel(e) })) ?? [];
  if (initial && !opts.some((o) => o.value === initial.value)) opts.unshift(initial);
  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={onChange}
      onSearch={setQ}
      filterOption={false}
      loading={isLoading}
      disabled={disabled}
      placeholder={placeholder ?? 'Tìm nhân viên theo tên hoặc mã'}
      style={style}
      options={opts}
    />
  );
}

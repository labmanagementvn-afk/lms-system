'use client';

import { Select } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';

/** Student picker with server-side search by name or code. */
export function StudentSelect({ value, onChange, style }: { value?: string; onChange?: (id: string) => void; style?: React.CSSProperties }) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useSWR<{ items: any[] }>(['/students', { q, pageSize: 20, status: 'STUDYING' }]);
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      onSearch={setQ}
      filterOption={false}
      loading={isLoading}
      placeholder="Tìm học sinh theo tên hoặc mã"
      style={style}
      options={data?.items.map((s) => ({ value: s.id, label: `${s.code} - ${s.fullName}${s.enrollments?.[0] ? ` (${s.enrollments[0].class.name})` : ''}` }))}
    />
  );
}

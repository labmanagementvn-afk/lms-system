'use client';

import { Select } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { STUDENT_STATUS } from '@/lib/labels';

/**
 * Student picker with server-side search by name or code. Studying students by default;
 * `status={null}` lists every student, with the status of those who left.
 */
export function StudentSelect({ value, onChange, style, status = 'STUDYING' }: { value?: string; onChange?: (id: string) => void; style?: React.CSSProperties; status?: string | null }) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useSWR<{ items: any[] }>(['/students', { q, pageSize: 20, status: status ?? undefined }]);
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
      options={data?.items.map((s) => ({
        value: s.id,
        label: `${s.code} - ${s.fullName}${s.enrollments?.[0] ? ` (${s.enrollments[0].class.name})` : ''}${s.status !== 'STUDYING' ? ` · ${STUDENT_STATUS[s.status]}` : ''}`,
      }))}
    />
  );
}

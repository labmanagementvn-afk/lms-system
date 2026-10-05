'use client';

import { Button, InputNumber, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { EMPLOYEE_DOCUMENT_KIND, EMPLOYMENT_TYPE } from '@/lib/labels';
import { employeeLabel, ExpiryTag, fmtDate } from './shared';

/** Documents and contracts that are expired or expire within the chosen number of days. */
export function ExpiringTab({ onOpen }: { onOpen: (employeeId: string) => void }) {
  const [days, setDays] = useState(60);
  const { data, isLoading } = useSWR<any>(['/hr/expiring', { days }]);

  const rows = [
    ...(data?.documents ?? []).map((d: any) => ({
      key: `d-${d.id}`,
      kind: 'Giấy tờ',
      employee: d.employee,
      title: `${EMPLOYEE_DOCUMENT_KIND[d.kind]}: ${d.name}`,
      detail: d.issuer,
      date: d.expiresAt,
      daysLeft: d.daysLeft,
    })),
    ...(data?.contracts ?? []).map((c: any) => ({
      key: `c-${c.id}`,
      kind: 'Hợp đồng',
      employee: c.employee,
      title: `Hợp đồng ${EMPLOYMENT_TYPE[c.type]?.toLowerCase() ?? ''}`,
      detail: `Từ ${fmtDate(c.startDate)}`,
      date: c.endDate,
      daysLeft: c.daysLeft,
    })),
  ].sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Space.Compact>
          <Button disabled tabIndex={-1}>
            Hết hạn trong
          </Button>
          <InputNumber min={0} max={730} value={days} onChange={(v) => setDays(v ?? 60)} style={{ width: 80 }} />
          <Button disabled tabIndex={-1}>
            ngày
          </Button>
        </Space.Compact>
      </Space>
      <Table<any>
        rowKey="key"
        size="small"
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: 'Loại', dataIndex: 'kind', width: 100, render: (k) => <Tag color={k === 'Giấy tờ' ? 'purple' : 'geekblue'}>{k}</Tag> },
          { title: 'Nhân viên', width: 260, render: (_, r) => employeeLabel(r.employee) },
          { title: 'Nội dung', dataIndex: 'title' },
          { title: 'Chi tiết', dataIndex: 'detail' },
          { title: 'Ngày hết hạn', dataIndex: 'date', width: 120, render: fmtDate },
          { title: 'Tình trạng', width: 150, render: (_, r) => <ExpiryTag date={r.date} daysLeft={r.daysLeft} /> },
          {
            title: '',
            width: 100,
            render: (_, r) => (
              <Button size="small" onClick={() => onOpen(r.employee.id)}>
                Mở hồ sơ
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

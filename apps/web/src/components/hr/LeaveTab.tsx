'use client';

import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Table, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { LEAVE_STATUS, LEAVE_TYPE } from '@/lib/labels';
import { DecideLeaveModal, LeaveRequestModal } from './LeaveModals';
import { employeeLabel, fmtDate, fmtDateTime, LeaveStatusTag } from './shared';

const statusOptions = Object.entries(LEAVE_STATUS).map(([value, s]) => ({ value, label: s.label }));

export function LeaveTab({ onChanged }: { onChanged?: () => void }) {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: 'PENDING' as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/hr/leave', query]);
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<any | null>(null);

  function changed() {
    mutate();
    onChanged?.();
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên hoặc mã nhân viên" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select placeholder="Trạng thái" allowClear value={query.status} options={statusOptions} style={{ width: 150 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Tạo đơn nghỉ phép
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Nhân viên', width: 240, render: (_, r) => employeeLabel(r.employee) },
          { title: 'Loại', dataIndex: 'type', width: 140, render: (t) => LEAVE_TYPE[t] },
          { title: 'Thời gian', width: 200, render: (_, r) => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
          { title: 'Số ngày', dataIndex: 'days', width: 80, align: 'right' },
          { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
          { title: 'Gửi lúc', dataIndex: 'createdAt', width: 140, render: fmtDateTime },
          { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (s) => <LeaveStatusTag status={s} /> },
          {
            title: 'Quyết định',
            width: 220,
            render: (_, r) =>
              r.decidedAt ? (
                <Typography.Text type="secondary">
                  {r.decidedBy?.fullName ?? ''} · {fmtDateTime(r.decidedAt)}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                </Typography.Text>
              ) : null,
          },
          {
            title: '',
            width: 110,
            render: (_, r) =>
              r.status === 'PENDING' && (
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setDeciding(r)}>
                  Xét duyệt
                </Button>
              ),
          },
        ]}
      />
      <LeaveRequestModal open={creating} onClose={() => setCreating(false)} onSaved={changed} />
      <DecideLeaveModal leave={deciding} onClose={() => setDeciding(null)} onSaved={changed} />
    </>
  );
}

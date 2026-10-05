'use client';

import { ImportOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Space, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { employeeLabel, fmtDate, fmtDateTime } from './shared';

export function LoansTab({ onChanged }: { onChanged?: () => void }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', open: true as boolean | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/assets/loans', query]);

  async function returnLoan(id: string) {
    try {
      await api(`/assets/loans/${id}/return`, { method: 'POST' });
      message.success('Đã nhận lại tài sản');
      mutate();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tài sản hoặc người mượn" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 280 }} />
        <Switch checkedChildren="Chưa trả" unCheckedChildren="Tất cả" checked={query.open === true} onChange={(on) => setQuery({ ...query, open: on ? true : undefined, page: 1 })} />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Tài sản', render: (_, r) => `${r.asset.code} · ${r.asset.name}` },
          { title: 'Người mượn', width: 220, render: (_, r) => (r.borrower ? employeeLabel(r.borrower) : r.borrowerName) },
          { title: 'Bộ phận', dataIndex: 'department', width: 140 },
          { title: 'Mượn lúc', dataIndex: 'lentAt', width: 140, render: fmtDateTime },
          {
            title: 'Hạn trả',
            dataIndex: 'dueAt',
            width: 150,
            render: (d, r) => (
              <>
                {fmtDate(d)} {r.overdue && <Tag color="red">Quá hạn</Tag>}
              </>
            ),
          },
          { title: 'Đã trả', dataIndex: 'returnedAt', width: 140, render: (d) => (d ? fmtDateTime(d) : <Tag color="blue">Chưa trả</Tag>) },
          { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
          {
            title: '',
            width: 110,
            render: (_, r) =>
              !r.returnedAt && (
                <Popconfirm title="Xác nhận đã nhận lại tài sản?" onConfirm={() => returnLoan(r.id)}>
                  <Button size="small" icon={<ImportOutlined />}>
                    Nhận lại
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />
    </>
  );
}

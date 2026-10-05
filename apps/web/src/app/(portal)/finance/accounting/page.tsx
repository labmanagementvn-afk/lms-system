'use client';

import { SyncOutlined } from '@ant-design/icons';
import { App, Button, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { SYNC_KIND, SYNC_STATUS } from '@/lib/labels';

export default function AccountingSyncPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, status: undefined as string | undefined, kind: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/accounting/sync', query]);
  const { data: summary, mutate: mutateSummary } = useSWR<any>(['/accounting/sync/summary']);
  const [viewing, setViewing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<any>, ok: (r: any) => string) {
    setBusy(true);
    try {
      message.success(ok(await fn()));
      mutate();
      mutateSummary();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Đồng bộ kế toán MISA"
        extra={
          <Button type="primary" icon={<SyncOutlined />} loading={busy} onClick={() => run(() => api('/accounting/sync/run', { method: 'POST' }), (r) => `Đã đồng bộ ${r.succeeded}, lỗi ${r.failed}`)}>
            Đồng bộ ngay
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">Kết nối: {summary?.provider === 'mock-misa' ? 'MISA AMIS (sandbox)' : summary?.provider}</Typography.Text>
        {summary &&
          Object.entries(SYNC_STATUS).map(([k, s]) => (
            <Tag key={k} color={s.color}>
              {s.label}: {summary[k]}
            </Tag>
          ))}
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(SYNC_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          onChange={(status) => setQuery({ ...query, status, page: 1 })}
        />
        <Select
          placeholder="Loại chứng từ"
          allowClear
          style={{ width: 180 }}
          options={Object.entries(SYNC_KIND).map(([value, label]) => ({ value, label }))}
          onChange={(kind) => setQuery({ ...query, kind, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
          { title: 'Loại', dataIndex: 'kind', width: 140, render: (k) => SYNC_KIND[k] },
          { title: 'Số chứng từ', render: (_, r) => r.payload.voucherNo },
          { title: 'Diễn giải', render: (_, r) => r.payload.description },
          { title: 'Mã bên MISA', dataIndex: 'externalRef' },
          { title: 'Lần thử', dataIndex: 'attempts', width: 80, align: 'right' },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 130,
            render: (s, r) => (
              <Tag color={SYNC_STATUS[s].color} title={r.lastError ?? undefined}>
                {SYNC_STATUS[s].label}
              </Tag>
            ),
          },
          {
            title: '',
            width: 150,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => setViewing(r)}>
                  Chi tiết
                </Button>
                {r.status === 'FAILED' && (
                  <Button size="small" onClick={() => run(() => api(`/accounting/sync/${r.id}/retry`, { method: 'POST' }), () => 'Đã đưa vào hàng đợi')}>
                    Thử lại
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={viewing && `${SYNC_KIND[viewing.kind]} ${viewing.payload.voucherNo}`} open={!!viewing} footer={null} onCancel={() => setViewing(null)} width={720}>
        {viewing?.lastError && <Typography.Paragraph type="danger">Lỗi gần nhất: {viewing.lastError}</Typography.Paragraph>}
        <pre style={{ maxHeight: 480, overflow: 'auto', background: '#f5f5f5', padding: 12, fontSize: 12 }}>{JSON.stringify(viewing?.payload, null, 2)}</pre>
      </Modal>
    </>
  );
}

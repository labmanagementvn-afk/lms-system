'use client';

import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { BANK_TXN_STATUS, vnd } from '@/lib/labels';

export default function ReconciliationPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: 'UNMATCHED' as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/finance/bank-transactions', query]);
  const { data: settings } = useSWR<any>(['/finance/settings']);
  const [matching, setMatching] = useState<any | null>(null);
  const [ignoring, setIgnoring] = useState<any | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [invoiceQ, setInvoiceQ] = useState('');
  const { data: invoices } = useSWR<any>(matching ? ['/finance/invoices', { q: invoiceQ, status: ['UNPAID', 'PARTIAL'], pageSize: 20 }] : null);
  const [form] = Form.useForm();

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      message.success(ok);
      mutate();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  }

  return (
    <>
      <PageHeader
        title="Đối soát ngân hàng"
        extra={
          settings?.sandbox && (
            <Button onClick={() => (form.resetFields(), setSimulating(true))} disabled={!settings?.bankAccountNo}>
              Mô phỏng giao dịch đến (sandbox)
            </Button>
          )
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Nội dung chuyển khoản" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select
          value={query.status}
          allowClear
          placeholder="Trạng thái"
          style={{ width: 160 }}
          options={Object.entries(BANK_TXN_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          onChange={(status) => setQuery({ ...query, status, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Thời gian', dataIndex: 'occurredAt', width: 150, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
          { title: 'Mã giao dịch', dataIndex: 'externalId', width: 160 },
          { title: 'Nội dung', dataIndex: 'description' },
          { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: vnd },
          {
            title: 'Khớp với',
            render: (_, r) =>
              r.payment ? `${r.payment.receiptNo} - ${r.payment.invoice.student.fullName}` : r.note ? <i>{r.note}</i> : null,
          },
          { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (s) => <Tag color={BANK_TXN_STATUS[s].color}>{BANK_TXN_STATUS[s].label}</Tag> },
          {
            title: '',
            width: 160,
            render: (_, r) =>
              r.status === 'UNMATCHED' && (
                <Space>
                  <Button size="small" type="primary" onClick={() => (setInvoiceQ(''), setMatching(r))}>
                    Khớp
                  </Button>
                  <Button size="small" onClick={() => (form.resetFields(), setIgnoring(r))}>
                    Bỏ qua
                  </Button>
                </Space>
              ),
          },
        ]}
      />
      <Modal title={`Khớp giao dịch ${vnd(matching?.amount)}`} open={!!matching} footer={null} onCancel={() => setMatching(null)} width={760} destroyOnHidden>
        <p>Nội dung: {matching?.description}</p>
        <Input.Search placeholder="Tìm học sinh có hóa đơn còn nợ" allowClear onSearch={setInvoiceQ} style={{ marginBottom: 12 }} />
        <Table<any>
          size="small"
          rowKey="id"
          dataSource={invoices?.items}
          pagination={false}
          columns={[
            { title: 'Mã TT', dataIndex: 'paymentRef' },
            { title: 'Học sinh', render: (_, r) => `${r.student.code} - ${r.student.fullName}` },
            { title: 'Nội dung', dataIndex: 'title' },
            { title: 'Còn nợ', align: 'right', render: (_, r) => vnd(r.total - r.paidAmount) },
            {
              title: '',
              render: (_, r) => (
                <Button
                  size="small"
                  type="primary"
                  onClick={async () => (await run(() => api(`/finance/bank-transactions/${matching.id}/match`, { method: 'POST', body: { invoiceId: r.id } }), 'Đã khớp và lập phiếu thu')) && setMatching(null)}
                >
                  Chọn
                </Button>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title="Bỏ qua giao dịch"
        open={!!ignoring}
        okText="Bỏ qua"
        cancelText="Hủy"
        onCancel={() => setIgnoring(null)}
        onOk={async () => {
          const { note } = await form.validateFields();
          if (await run(() => api(`/finance/bank-transactions/${ignoring.id}/ignore`, { method: 'POST', body: { note } }), 'Đã bỏ qua')) setIgnoring(null);
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="note" label="Lý do" rules={[{ required: true }]}>
            <Input placeholder="Chuyển nhầm, đã hoàn lại" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Mô phỏng giao dịch chuyển khoản đến"
        open={simulating}
        okText="Gửi"
        cancelText="Hủy"
        onCancel={() => setSimulating(false)}
        onOk={async () => {
          const body = await form.validateFields();
          if (await run(() => api('/finance/sandbox/transfers', { method: 'POST', body }), 'Đã nhận giao dịch')) setSimulating(false);
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="amount" label="Số tiền" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter="₫" />
          </Form.Item>
          <Form.Item name="description" label="Nội dung chuyển khoản" rules={[{ required: true }]} extra="Có mã thanh toán (HP...) thì hệ thống tự khớp hóa đơn">
            <Input placeholder="HPABCD2345 Tran Minh Anh hoc phi" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

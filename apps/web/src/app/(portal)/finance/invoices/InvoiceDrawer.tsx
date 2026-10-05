'use client';

import { App, Alert, Button, Descriptions, Divider, Drawer, Flex, Form, Input, InputNumber, Popconfirm, QRCode, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { INVOICE_SOURCE, INVOICE_STATUS, PAYMENT_METHOD, vnd } from '@/lib/labels';

const OPEN = ['UNPAID', 'PARTIAL'];

export function InvoiceDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { me } = useAuth();
  const { message, modal } = App.useApp();
  const { data: inv, mutate } = useSWR<any>(id ? [`/finance/invoices/${id}`] : null);
  const open = inv && OPEN.includes(inv.status);
  const { data: qr, error: qrError } = useSWR<any>(open ? [`/finance/invoices/${id}/payment-qr`, { v: inv.paidAmount }] : null);
  const { data: settings } = useSWR<any>(['/finance/settings']);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      mutate();
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    const values = await form.validateFields();
    await act(() => api(`/finance/invoices/${id}/payments`, { method: 'POST', body: values }), 'Đã lập phiếu thu');
    form.resetFields();
  }

  function voidPayment(p: any) {
    let reason = '';
    modal.confirm({
      title: `Hủy phiếu thu ${p.receiptNo}?`,
      content: <Input.TextArea placeholder="Lý do hủy" onChange={(e) => (reason = e.target.value)} />,
      okText: 'Hủy phiếu thu',
      okButtonProps: { danger: true },
      cancelText: 'Đóng',
      onOk: () => act(() => api(`/finance/payments/${p.id}/void`, { method: 'POST', body: { reason: reason || 'Không ghi lý do' } }), 'Đã hủy phiếu thu'),
    });
  }

  const remaining = inv ? inv.total - inv.paidAmount : 0;
  const status = inv && INVOICE_STATUS[inv.status];

  return (
    <Drawer open={!!id} onClose={onClose} width={720} title={inv ? `${inv.title} - ${inv.student.fullName}` : 'Hóa đơn'} destroyOnHidden>
      {inv && (
        <>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Học sinh">
              {inv.student.code} - {inv.student.fullName}
            </Descriptions.Item>
            <Descriptions.Item label="Lớp">{inv.student.enrollments[0]?.class.name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Mã thanh toán">
              <Typography.Text copyable strong>
                {inv.paymentRef}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={status.color}>{status.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Nguồn">{INVOICE_SOURCE[inv.source]}</Descriptions.Item>
            <Descriptions.Item label="Hạn nộp">{inv.dueDate ? dayjs(inv.dueDate).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
            <Descriptions.Item label="Phụ huynh" span={2}>
              {inv.student.guardians?.[0] ? `${inv.student.guardians[0].fullName} - ${inv.student.guardians[0].phone}` : '-'}
            </Descriptions.Item>
          </Descriptions>

          {inv.carriedTo && (
            <Alert style={{ marginTop: 12 }} type="info" showIcon message={`Số còn nợ đã chuyển sang hóa đơn "${inv.carriedTo.title}" (${inv.carriedTo.paymentRef}).`} />
          )}

          <Table<any>
            style={{ marginTop: 16 }}
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={inv.lines}
            columns={[
              { title: 'Nội dung', dataIndex: 'description' },
              { title: 'SL', dataIndex: 'quantity', width: 60, align: 'right' },
              { title: 'Đơn giá', dataIndex: 'unitPrice', align: 'right', render: vnd },
              { title: 'Miễn giảm', dataIndex: 'discount', align: 'right', render: (v) => (v ? `-${vnd(v)}` : '') },
              { title: 'Thành tiền', dataIndex: 'amount', align: 'right', render: vnd },
            ]}
            summary={() => (
              <>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <b>Tổng phải thu</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <b>{vnd(inv.total)}</b>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    Đã thu
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    {vnd(inv.paidAmount)}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    {remaining < 0 ? 'Thu thừa' : 'Còn phải thu'}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Typography.Text type={remaining > 0 ? 'danger' : undefined} strong>
                      {vnd(Math.abs(remaining))}
                    </Typography.Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            )}
          />

          {open && (
            <>
              <Divider orientation="left">Thu tiền</Divider>
              <Flex gap={24} wrap align="flex-start">
                <div style={{ textAlign: 'center' }}>
                  {qr ? (
                    <>
                      <QRCode value={qr.qrPayload} size={180} />
                      <Typography.Paragraph type="secondary" style={{ maxWidth: 220, marginTop: 8, fontSize: 12 }}>
                        {qr.bankName} - {qr.bankAccountNo}
                        <br />
                        {qr.bankAccountName}
                        <br />
                        Nội dung: <b>{qr.transferNote}</b>
                      </Typography.Paragraph>
                    </>
                  ) : (
                    <Alert type="warning" message={qrError?.message ?? 'Đang tạo mã QR...'} style={{ maxWidth: 220 }} />
                  )}
                </div>
                <Form form={form} layout="vertical" initialValues={{ method: 'CASH', amount: remaining }} style={{ flex: 1, minWidth: 240 }}>
                  <Form.Item name="amount" label="Số tiền" rules={[{ required: true }]}>
                    <InputNumber<number>
                      min={1}
                      max={remaining}
                      style={{ width: '100%' }}
                      formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={(v) => Number((v ?? '').replace(/\./g, ''))}
                      addonAfter="₫"
                    />
                  </Form.Item>
                  <Form.Item name="method" label="Hình thức">
                    <Select options={[{ value: 'CASH', label: PAYMENT_METHOD.CASH }, { value: 'BANK_TRANSFER', label: 'Chuyển khoản (xác nhận thủ công)' }]} />
                  </Form.Item>
                  <Form.Item name="note" label="Ghi chú">
                    <Input />
                  </Form.Item>
                  <Space wrap>
                    <Button type="primary" loading={busy} onClick={pay}>
                      Lập phiếu thu
                    </Button>
                    {settings?.sandbox && qr && (
                      <Button
                        loading={busy}
                        onClick={() =>
                          act(
                            () => api('/finance/sandbox/transfers', { method: 'POST', body: { amount: remaining, description: qr.transferNote } }),
                            'Đã mô phỏng chuyển khoản',
                          )
                        }
                      >
                        Mô phỏng phụ huynh chuyển khoản (sandbox)
                      </Button>
                    )}
                  </Space>
                </Form>
              </Flex>
            </>
          )}

          <Divider orientation="left">Phiếu thu</Divider>
          <Table<any>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={inv.payments}
            locale={{ emptyText: 'Chưa có phiếu thu' }}
            columns={[
              { title: 'Số phiếu', dataIndex: 'receiptNo' },
              { title: 'Ngày thu', dataIndex: 'paidAt', render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
              { title: 'Hình thức', dataIndex: 'method', render: (m) => PAYMENT_METHOD[m] },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: vnd },
              {
                title: '',
                render: (_, p) =>
                  p.status === 'VOIDED' ? (
                    <Tag title={p.voidReason}>Đã hủy</Tag>
                  ) : me?.role === 'ADMIN' && inv.status !== 'CARRIED_OVER' ? (
                    <Button size="small" danger onClick={() => voidPayment(p)}>
                      Hủy
                    </Button>
                  ) : null,
              },
            ]}
          />

          {inv.status === 'UNPAID' && !inv.storeOrder && (
            <Popconfirm title="Hủy hóa đơn này?" onConfirm={() => act(() => api(`/finance/invoices/${id}/cancel`, { method: 'POST' }), 'Đã hủy hóa đơn')}>
              <Button danger style={{ marginTop: 16 }}>
                Hủy hóa đơn
              </Button>
            </Popconfirm>
          )}
        </>
      )}
    </Drawer>
  );
}

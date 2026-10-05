'use client';

import { Alert, App, Button, Card, Col, Form, Input, QRCode, Row, Typography } from 'antd';
import { useEffect } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Common NAPAS BINs; any 6-digit BIN is accepted.
const BANKS = [
  ['970436', 'Vietcombank'],
  ['970415', 'VietinBank'],
  ['970418', 'BIDV'],
  ['970405', 'Agribank'],
  ['970422', 'MB Bank'],
  ['970407', 'Techcombank'],
  ['970416', 'ACB'],
  ['970432', 'VPBank'],
  ['970423', 'TPBank'],
  ['970403', 'Sacombank'],
];

export default function FinanceSettingsPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data, mutate } = useSWR<any>(['/finance/settings']);
  const [form] = Form.useForm();
  const admin = me?.role === 'ADMIN';

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  async function save() {
    const values = await form.validateFields();
    try {
      mutate(await api('/finance/settings', { method: 'PUT', body: clean(values) }), false);
      message.success('Đã lưu');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Tài khoản nhận tiền" />
      {data?.sandbox && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="Đang chạy chế độ sandbox"
          description="Mã QR là mã VietQR thật theo tài khoản bên dưới, nhưng giao dịch được mô phỏng; chưa kết nối cổng thanh toán hoặc MISA thật."
        />
      )}
      <Row gutter={16}>
        <Col xs={24} md={14}>
          <Card title="Tài khoản ngân hàng của trường">
            <Form form={form} layout="vertical" disabled={!admin}>
              <Form.Item name="bankBin" label="Mã BIN ngân hàng (NAPAS)" rules={[{ pattern: /^\d{6}$/, message: '6 chữ số' }]}>
                <Input
                  placeholder="970436"
                  addonAfter={
                    <select
                      aria-label="Chọn ngân hàng"
                      style={{ border: 0, background: 'transparent' }}
                      onChange={(e) => {
                        const bank = BANKS.find(([bin]) => bin === e.target.value);
                        if (bank) form.setFieldsValue({ bankBin: bank[0], bankName: bank[1] });
                      }}
                      value=""
                    >
                      <option value="">Chọn nhanh</option>
                      {BANKS.map(([bin, name]) => (
                        <option key={bin} value={bin}>
                          {name}
                        </option>
                      ))}
                    </select>
                  }
                />
              </Form.Item>
              <Form.Item name="bankName" label="Tên ngân hàng">
                <Input />
              </Form.Item>
              <Form.Item name="bankAccountNo" label="Số tài khoản">
                <Input />
              </Form.Item>
              <Form.Item name="bankAccountName" label="Chủ tài khoản">
                <Input placeholder="TRUONG THCS DEMO" />
              </Form.Item>
              <Form.Item name="receiptPrefix" label="Tiền tố số phiếu thu" extra="Ví dụ PT → PT2026-000001">
                <Input style={{ width: 120 }} />
              </Form.Item>
              {admin && (
                <Button type="primary" onClick={save}>
                  Lưu
                </Button>
              )}
            </Form>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Mã QR nhận tiền">
            {data?.sampleQr ? <QRCode value={data.sampleQr} /> : <Typography.Text type="secondary">Nhập mã BIN và số tài khoản để tạo mã QR.</Typography.Text>}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Mỗi hóa đơn có mã QR riêng kèm số tiền và mã thanh toán (HP...). Khi ngân hàng báo có, hệ thống tự khớp và lập phiếu thu.
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              Cổng thông báo giao dịch: <b>{data?.paymentProvider}</b>
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </>
  );
}

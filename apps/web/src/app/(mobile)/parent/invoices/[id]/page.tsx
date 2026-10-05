'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, QRCode, Spin, Table, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { INVOICE_STATUS, PAYMENT_METHOD, vnd } from '@/lib/labels';

export default function ParentInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: inv, error, isLoading } = useSWR<any>([`/parent/invoices/${id}`]);

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !inv) return <Alert type="error" message={error?.message ?? 'Không tìm thấy hóa đơn'} />;

  const st = INVOICE_STATUS[inv.status];
  const remaining = inv.total - inv.paidAmount;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href="/parent/invoices">
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }}>
          Học phí
        </Button>
      </Link>
      <Card size="small">
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {inv.title}
        </Typography.Title>
        <Tag color={st?.color}>{st?.label ?? inv.status}</Tag>
        <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="Học sinh">{inv.student?.fullName}</Descriptions.Item>
          <Descriptions.Item label="Tổng tiền">{vnd(inv.total)}</Descriptions.Item>
          <Descriptions.Item label="Đã nộp">{vnd(inv.paidAmount)}</Descriptions.Item>
          <Descriptions.Item label="Còn lại">
            <b style={{ color: remaining > 0 ? '#dc2626' : '#16a34a' }}>{vnd(Math.max(0, remaining))}</b>
          </Descriptions.Item>
          {inv.dueDate && <Descriptions.Item label="Hạn nộp">{new Date(inv.dueDate).toLocaleDateString('vi-VN')}</Descriptions.Item>}
        </Descriptions>
      </Card>

      {inv.qr && (
        <Card size="small" title="Thanh toán bằng QR ngân hàng">
          <div style={{ textAlign: 'center' }}>
            <QRCode value={inv.qr.qrPayload} size={220} />
            <Typography.Paragraph style={{ marginTop: 8, marginBottom: 4 }}>
              {inv.qr.bankName} · {inv.qr.bankAccountNo}
            </Typography.Paragraph>
            <Typography.Text type="secondary">{inv.qr.bankAccountName}</Typography.Text>
            <Typography.Paragraph style={{ marginTop: 8 }}>
              Số tiền: <b>{vnd(inv.qr.amount)}</b>
              <br />
              Nội dung: <b>{inv.qr.transferNote}</b>
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Mở ứng dụng ngân hàng, quét mã và giữ nguyên nội dung chuyển khoản để hệ thống tự ghi nhận.
            </Typography.Text>
          </div>
        </Card>
      )}
      {!inv.qr && remaining > 0 && inv.status !== 'CARRIED_OVER' && (
        <Alert type="info" showIcon message="Nhà trường chưa bật thanh toán QR cho khoản này. Vui lòng nộp tại văn phòng." />
      )}
      {inv.status === 'CARRIED_OVER' && inv.carriedTo && (
        <Alert type="info" showIcon message={`Số còn nợ đã được chuyển sang "${inv.carriedTo.title}".`} />
      )}

      <Card size="small" title="Chi tiết">
        <Table<any>
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={inv.lines}
          columns={[
            { title: 'Khoản', dataIndex: 'description' },
            { title: 'Thành tiền', dataIndex: 'amount', align: 'right', render: (v: number) => vnd(v) },
          ]}
        />
      </Card>

      {inv.payments?.length > 0 && (
        <Card size="small" title="Đã nộp">
          <Table<any>
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={inv.payments}
            columns={[
              { title: 'Ngày', dataIndex: 'paidAt', render: (v: string) => new Date(v).toLocaleDateString('vi-VN') },
              { title: 'Phiếu thu', dataIndex: 'receiptNo' },
              { title: 'Hình thức', dataIndex: 'method', render: (v: string) => PAYMENT_METHOD[v] ?? v },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v: number, p: any) => (p.status === 'VOIDED' ? <s>{vnd(v)}</s> : vnd(v)) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

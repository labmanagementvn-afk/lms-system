'use client';

import { DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Descriptions, Form, Input, Popconfirm, Select, Space, Tag } from 'antd';
import useSWR from 'swr';
import { formatDate } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Chữ ký số: the signer's remote signing account (VNPT SmartCA or Viettel MySign) and its certificate. */
export function SignatureCard() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { data, mutate } = useSWR<any>(['/esign/profile']);
  const [form] = Form.useForm();
  const p = data?.profile;
  const sandbox = data?.providers?.some((x: any) => x.sandbox);

  async function save(v: { provider: string; account: string }) {
    try {
      await mutate(await api('/esign/profile', { method: 'PUT', body: v }), { revalidate: false });
      message.success('Đã lưu tài khoản ký số');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove() {
    try {
      await api('/esign/profile', { method: 'DELETE' });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Card size="small" title={<><SafetyCertificateOutlined /> Chữ ký số</>}>
      {sandbox && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Môi trường thử nghiệm: chữ ký số tạo ra không có giá trị pháp lý." />}
      {p ? (
        <>
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Nhà cung cấp">{p.providerLabel}</Descriptions.Item>
            <Descriptions.Item label="Tài khoản">{p.account}</Descriptions.Item>
            <Descriptions.Item label="Chủ thể">{p.certSubject}</Descriptions.Item>
            <Descriptions.Item label="Số sê-ri">{p.certSerial}</Descriptions.Item>
            <Descriptions.Item label="Nơi cấp">{p.certIssuer}</Descriptions.Item>
            <Descriptions.Item label="Hiệu lực">
              <Space>
                {formatDate(p.certValidFrom, tz)} - {formatDate(p.certValidTo, tz)}
                <Tag color={p.valid ? 'green' : 'red'}>{p.valid ? 'Còn hiệu lực' : 'Hết hiệu lực'}</Tag>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <Popconfirm title="Xóa tài khoản ký số?" okText="Xóa" cancelText="Hủy" onConfirm={remove}>
            <Button danger size="small" icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </>
      ) : (
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ provider: 'VNPT_SMARTCA' }}>
          <Form.Item name="provider" label="Nhà cung cấp">
            <Select options={(data?.providers ?? []).map((x: any) => ({ value: x.provider, label: x.label }))} />
          </Form.Item>
          <Form.Item name="account" label="Tài khoản ký số" tooltip="Số CCCD hoặc số điện thoại đã đăng ký dịch vụ ký số từ xa" rules={[{ required: true, message: 'Nhập số CCCD hoặc số điện thoại' }]}>
            <Input placeholder="079085001234" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            Kiểm tra chứng thư và lưu
          </Button>
        </Form>
      )}
    </Card>
  );
}

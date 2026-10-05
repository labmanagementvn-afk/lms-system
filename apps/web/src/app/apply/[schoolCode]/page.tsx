'use client';

import { SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, DatePicker, Descriptions, Divider, Form, Input, Result, Select, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { APPLICATION_STATUS, GENDER, options, RELATIONSHIP } from '@/lib/labels';

const fmt = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');

/** Public application form: no account needed, phone friendly. */
export default function ApplyPage() {
  const { schoolCode } = useParams<{ schoolCode: string }>();
  const { data, error, isLoading } = useSWR<any>(schoolCode ? [`/public/admissions/${schoolCode}`] : null);

  return (
    <div style={{ minHeight: '100vh', padding: '16px 12px 40px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }}>
        {isLoading && (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
            <Spin size="large" />
          </div>
        )}
        {error && <Result status="404" title="Không tìm thấy trường" subTitle="Vui lòng kiểm tra lại đường dẫn nhà trường đã gửi." />}
        {data && (
          <>
            <div style={{ textAlign: 'center' }}>
              <Typography.Title level={3} style={{ marginBottom: 4 }}>
                {data.school.name}
              </Typography.Title>
              <Typography.Text type="secondary">Đăng ký tuyển sinh trực tuyến{data.school.address ? ` · ${data.school.address}` : ''}</Typography.Text>
            </div>
            <ApplicationForm schoolCode={schoolCode} rounds={data.rounds} />
            <LookupCard schoolCode={schoolCode} />
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationForm({ schoolCode, rounds }: { schoolCode: string; rounds: any[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any | null>(null);
  const roundId = Form.useWatch('roundId', form);
  const round = rounds.find((r) => r.id === roundId);

  async function submit(values: any) {
    setBusy(true);
    try {
      const body = clean({ ...values, dateOfBirth: values.dateOfBirth.format('YYYY-MM-DD') });
      setDone(await api(`/public/admissions/${schoolCode}/applications`, { method: 'POST', body }));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <Result
          status="success"
          title="Đã nộp hồ sơ thành công"
          subTitle={
            <>
              Hồ sơ của <strong>{done.fullName}</strong> ({done.round.name}) đã được ghi nhận. Mã hồ sơ của bạn:
              <div style={{ fontSize: 28, fontWeight: 700, margin: '12px 0', letterSpacing: 1 }}>{done.code}</div>
              Vui lòng lưu lại mã này cùng số điện thoại đã khai để tra cứu kết quả.
            </>
          }
          extra={
            <Button
              onClick={() => {
                setDone(null);
                form.resetFields();
              }}
            >
              Nộp hồ sơ khác
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card title="Nộp hồ sơ">
      {rounds.length === 0 ? (
        <Alert type="info" showIcon message="Hiện chưa có đợt tuyển sinh nào đang nhận hồ sơ." description="Vui lòng quay lại sau hoặc liên hệ văn phòng nhà trường." />
      ) : (
        <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional" initialValues={{ roundId: rounds.length === 1 ? rounds[0].id : undefined, guardianRelationship: 'FATHER' }}>
          <Form.Item name="roundId" label="Đợt tuyển sinh" rules={[{ required: true, message: 'Chọn đợt tuyển sinh' }]}>
            <Select options={rounds.map((r) => ({ value: r.id, label: `${r.name} (khối ${r.gradeLevel})` }))} placeholder="Chọn đợt" />
          </Form.Item>
          {round && (
            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              message={`Nhận hồ sơ từ ${fmt(round.startDate)} đến ${fmt(round.endDate)} · Năm học ${round.academicYear?.name ?? ''}`}
              description={round.description}
            />
          )}
          <Divider orientation="left" plain>
            Thông tin học sinh
          </Divider>
          <Form.Item name="fullName" label="Họ và tên học sinh" rules={[{ required: true, message: 'Nhập họ tên học sinh' }]}>
            <Input maxLength={120} autoComplete="off" />
          </Form.Item>
          <Space wrap size="middle">
            <Form.Item name="dateOfBirth" label="Ngày sinh" rules={[{ required: true, message: 'Chọn ngày sinh' }]}>
              <DatePicker format="DD/MM/YYYY" inputReadOnly placeholder="dd/mm/yyyy" />
            </Form.Item>
            <Form.Item name="gender" label="Giới tính">
              <Select options={options(GENDER)} allowClear style={{ width: 120 }} placeholder="Chọn" />
            </Form.Item>
          </Space>
          <Form.Item name="previousSchool" label="Trường đang học">
            <Input maxLength={200} placeholder="Ví dụ: Tiểu học Kim Đồng" />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ gia đình">
            <Input maxLength={255} />
          </Form.Item>
          <Divider orientation="left" plain>
            Thông tin phụ huynh
          </Divider>
          <Form.Item name="guardianName" label="Họ và tên phụ huynh" rules={[{ required: true, message: 'Nhập họ tên phụ huynh' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Space wrap size="middle">
            <Form.Item name="guardianPhone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }, { pattern: /^(\+?84|0)[\d\s.]{8,13}$/, message: 'Số điện thoại không hợp lệ' }]}>
              <Input inputMode="tel" maxLength={20} style={{ width: 180 }} placeholder="0903 123 456" />
            </Form.Item>
            <Form.Item name="guardianRelationship" label="Quan hệ với học sinh">
              <Select options={options(RELATIONSHIP)} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="guardianEmail" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input inputMode="email" maxLength={120} />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú thêm">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Nguyện vọng, thông tin cần lưu ý..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={busy}>
            Nộp hồ sơ
          </Button>
        </Form>
      )}
    </Card>
  );
}

function LookupCard({ schoolCode }: { schoolCode: string }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(values: { code: string; phone: string }) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api(`/public/admissions/${schoolCode}/applications/${encodeURIComponent(values.code.trim().toUpperCase())}`, { query: { phone: values.phone } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = result && APPLICATION_STATUS[result.status];

  return (
    <Card title="Tra cứu hồ sơ">
      <Form form={form} layout="vertical" onFinish={lookup}>
        <Space wrap size="middle" align="end">
          <Form.Item name="code" label="Mã hồ sơ" rules={[{ required: true, message: 'Nhập mã hồ sơ' }]} style={{ marginBottom: 0 }}>
            <Input placeholder="TS26-00001" style={{ width: 160, textTransform: 'uppercase' }} autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại phụ huynh" rules={[{ required: true, message: 'Nhập số điện thoại' }]} style={{ marginBottom: 0 }}>
            <Input inputMode="tel" style={{ width: 180 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={busy}>
            Tra cứu
          </Button>
        </Space>
      </Form>
      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}
      {result && (
        <Descriptions column={1} size="small" bordered style={{ marginTop: 16 }}>
          <Descriptions.Item label="Học sinh">
            {result.fullName} · {fmt(result.dateOfBirth)}
          </Descriptions.Item>
          <Descriptions.Item label="Đợt tuyển sinh">{result.round.name}</Descriptions.Item>
          <Descriptions.Item label="Ngày nộp">{fmt(result.submittedAt)}</Descriptions.Item>
          <Descriptions.Item label="Kết quả">
            <Tag color={status.color} style={{ fontSize: 14, padding: '2px 10px' }}>
              {status.label}
            </Tag>
            {result.class && ` Lớp ${result.class.name}`}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
}

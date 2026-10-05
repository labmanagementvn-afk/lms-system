'use client';

import { KeyOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Form, Input, Modal, Popconfirm, Radio, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';
import { DEVICE_TYPE, DIRECTION, IDENTITY_METHOD, options } from '@/lib/labels';

export default function DevicesPage() {
  const { me } = useAuth();
  return (
    <>
      <PageHeader title="Thiết bị & định danh điểm danh" />
      <Tabs
        items={[
          { key: 'identities', label: 'Định danh (thẻ, khuôn mặt, vân tay)', children: <Identities /> },
          ...(canManage(me) ? [{ key: 'devices', label: 'Máy chấm công / cổng', children: <Devices /> }] : []),
        ]}
      />
    </>
  );
}

function Devices() {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/attendance/devices']);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; apiKey: string } | null>(null);
  const [form] = Form.useForm();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

  async function create() {
    const values = await form.validateFields();
    try {
      const d = await api('/attendance/devices', { method: 'POST', body: clean(values) });
      setCreating(false);
      setNewKey({ name: d.name, apiKey: d.apiKey });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function rotate(id: string, name: string) {
    const d = await api(`/attendance/devices/${id}/rotate-key`, { method: 'POST' });
    setNewKey({ name, apiKey: d.apiKey });
    mutate();
  }

  async function toggle(id: string, isActive: boolean) {
    await api(`/attendance/devices/${id}`, { method: 'PATCH', body: { isActive } });
    mutate();
  }

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Kết nối máy quét"
        description={
          <>
            <div>
              Máy hoặc phần mềm cầu nối gửi sự kiện tới <Typography.Text code>{`POST ${apiBase}/attendance/ingest`}</Typography.Text> kèm header{' '}
              <Typography.Text code>X-Device-Key</Typography.Text>.
            </div>
            <div>
              Máy ZKTeco hỗ trợ ADMS/Push: khai báo số serial, rồi trỏ mục &quot;Cloud Server&quot; của máy tới địa chỉ máy chủ API (đường dẫn <Typography.Text code>/iclock</Typography.Text>).
            </div>
          </>
        }
      />
      <Button type="primary" icon={<PlusOutlined />} onClick={() => (form.resetFields(), setCreating(true))} style={{ marginBottom: 12 }}>
        Thêm thiết bị
      </Button>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        size="small"
        scroll={{ x: 900 }}
        pagination={false}
        columns={[
          { title: 'Tên thiết bị', dataIndex: 'name' },
          { title: 'Loại', dataIndex: 'type', render: (t) => DEVICE_TYPE[t] },
          { title: 'Hãng', dataIndex: 'vendor' },
          { title: 'Serial', dataIndex: 'serialNumber' },
          { title: 'Vị trí', dataIndex: 'location' },
          { title: 'Chiều mặc định', dataIndex: 'defaultDirection', render: (d) => DIRECTION[d] },
          { title: 'Lần cuối kết nối', dataIndex: 'lastSeenAt', render: (d) => (d ? dayjs(d).format('DD/MM HH:mm') : <Tag>Chưa kết nối</Tag>) },
          { title: 'Hoạt động', dataIndex: 'isActive', render: (v, r) => <Switch checked={v} size="small" onChange={(c) => toggle(r.id, c)} /> },
          {
            title: '',
            render: (_, r) => (
              <Popconfirm title="Tạo khóa mới? Khóa cũ sẽ ngừng hoạt động." onConfirm={() => rotate(r.id, r.name)}>
                <Button size="small" icon={<KeyOutlined />}>
                  Đổi khóa
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal title="Thêm thiết bị" open={creating} onOk={create} onCancel={() => setCreating(false)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ type: 'FACE', defaultDirection: 'UNKNOWN' }}>
          <Form.Item name="name" label="Tên thiết bị" rules={[{ required: true }]}>
            <Input placeholder="Cổng chính - làn vào" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="type" label="Loại">
              <Select options={options(DEVICE_TYPE)} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="vendor" label="Hãng">
              <Input placeholder="ZKTeco, Hikvision..." />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="serialNumber" label="Số serial" extra="Bắt buộc với máy ZKTeco (ADMS)">
              <Input />
            </Form.Item>
            <Form.Item name="location" label="Vị trí">
              <Input placeholder="Cổng chính" />
            </Form.Item>
          </Space>
          <Form.Item name="defaultDirection" label="Chiều mặc định" extra="Dùng khi máy không gửi chiều vào/ra (ví dụ máy đặt riêng ở làn vào)">
            <Radio.Group options={options(DIRECTION)} optionType="button" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={`Khóa API cho "${newKey?.name}"`} open={!!newKey} onOk={() => setNewKey(null)} onCancel={() => setNewKey(null)} cancelButtonProps={{ style: { display: 'none' } }} okText="Đã lưu khóa">
        <Alert type="warning" showIcon message="Khóa chỉ hiển thị một lần. Hãy sao chép và cấu hình vào máy hoặc phần mềm cầu nối." style={{ marginBottom: 12 }} />
        <Typography.Paragraph copyable code style={{ wordBreak: 'break-all' }}>
          {newKey?.apiKey}
        </Typography.Paragraph>
      </Modal>
    </>
  );
}

function Identities() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [method, setMethod] = useState<string>();
  const { data, isLoading, mutate } = useSWR<any[]>(['/attendance/identities', { method }]);
  const [creating, setCreating] = useState(false);
  const [personType, setPersonType] = useState<'student' | 'teacher'>('student');
  const [search, setSearch] = useState('');
  const { data: found } = useSWR<any>(search ? [personType === 'student' ? '/students' : '/teachers', { q: search, pageSize: 20 }] : null);
  const [form] = Form.useForm();
  const selectedMethod = Form.useWatch('method', form);

  async function create() {
    const values = await form.validateFields();
    const { personId, consentAt, ...rest } = values;
    try {
      await api('/attendance/identities', {
        method: 'POST',
        body: clean({ ...rest, consentAt: consentAt?.format('YYYY-MM-DD'), [personType === 'student' ? 'studentId' : 'teacherId']: personId }),
      });
      message.success('Đã gán định danh');
      setCreating(false);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function revoke(id: string) {
    await api(`/attendance/identities/${id}/revoke`, { method: 'POST' });
    message.success('Đã thu hồi. Hãy xóa dữ liệu khuôn mặt/vân tay trên máy.');
    mutate();
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => (form.resetFields(), setSearch(''), setCreating(true))}>
          Gán định danh
        </Button>
        <Select placeholder="Tất cả phương thức" allowClear style={{ width: 260 }} options={options(IDENTITY_METHOD)} onChange={setMethod} />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        size="small"
        scroll={{ x: 900 }}
        columns={[
          { title: 'Người', render: (_, r) => (r.student ? `${r.student.fullName} (${r.student.code})` : `GV ${r.teacher.fullName} (${r.teacher.code})`) },
          { title: 'Phương thức', dataIndex: 'method', render: (m) => IDENTITY_METHOD[m] },
          { title: 'Mã trên máy / số thẻ', dataIndex: 'externalId' },
          {
            title: 'Đồng ý (NĐ 13/2023)',
            render: (_, r) => (r.consentAt ? `${r.consentGivenBy}${r.consentRelationship ? ` (${r.consentRelationship})` : ''} · ${dayjs(r.consentAt).format('DD/MM/YYYY')}` : ''),
          },
          { title: 'Trạng thái', render: (_, r) => (r.revokedAt ? <Tag>Đã thu hồi</Tag> : <Tag color="green">Hiệu lực</Tag>) },
          {
            title: '',
            render: (_, r) =>
              !r.revokedAt && (me?.role === 'ADMIN' || me?.role === 'STAFF') ? (
                <Popconfirm title="Thu hồi định danh / rút lại sự đồng ý?" onConfirm={() => revoke(r.id)}>
                  <Button size="small" icon={<StopOutlined />}>
                    Thu hồi
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />
      <Modal title="Gán định danh điểm danh" open={creating} onOk={create} onCancel={() => setCreating(false)} okText="Lưu" cancelText="Hủy" width={600} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ method: 'CARD' }}>
          <Radio.Group value={personType} onChange={(e) => (setPersonType(e.target.value), form.setFieldValue('personId', undefined))} optionType="button" style={{ marginBottom: 12 }}>
            <Radio.Button value="student">Học sinh</Radio.Button>
            <Radio.Button value="teacher">Giáo viên</Radio.Button>
          </Radio.Group>
          <Form.Item name="personId" label={personType === 'student' ? 'Học sinh' : 'Giáo viên'} rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={setSearch}
              placeholder="Gõ tên hoặc mã để tìm"
              options={found?.items.map((p: any) => ({ value: p.id, label: `${p.fullName} (${p.code})` }))}
            />
          </Form.Item>
          <Form.Item name="method" label="Phương thức">
            <Radio.Group options={options(IDENTITY_METHOD)} />
          </Form.Item>
          <Form.Item name="externalId" label={selectedMethod === 'BIOMETRIC' ? 'Mã người dùng trên máy' : 'Số thẻ / nội dung QR'} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {selectedMethod === 'BIOMETRIC' && (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Dữ liệu sinh trắc học là dữ liệu cá nhân nhạy cảm (Nghị định 13/2023/NĐ-CP)"
                description="Chỉ đăng ký khuôn mặt/vân tay sau khi có sự đồng ý bằng văn bản của cha mẹ hoặc người giám hộ (với học sinh) hoặc của chính giáo viên."
              />
              <Space wrap>
                <Form.Item name="consentGivenBy" label="Người đồng ý" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="consentRelationship" label="Quan hệ">
                  <Input placeholder="Cha, mẹ, bản thân..." />
                </Form.Item>
                <Form.Item name="consentAt" label="Ngày đồng ý" rules={[{ required: true }]}>
                  <DatePicker format="DD/MM/YYYY" />
                </Form.Item>
              </Space>
              <Form.Item name="consentReference" label="Số phiếu / tham chiếu văn bản">
                <Input />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

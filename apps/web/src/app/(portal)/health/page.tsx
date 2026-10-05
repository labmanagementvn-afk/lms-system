'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Result, Row, Select, Space, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { CSSProperties, useEffect, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { INCIDENT_SEVERITY } from '@/lib/labels';

type Picked = { value: string; label: string };

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }));
const fmt = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');
const fmtTime = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '');
const studentLabel = (s: any) => `${s.code} · ${s.fullName}${s.class ? ` (${s.class.name})` : s.enrollments?.[0] ? ` (${s.enrollments[0].class.name})` : ''}`;
// Same formula as the API; children's BMI is read against WHO age/sex percentiles, so no category is shown.
const bmi = (h?: number, w?: number) => (h && w ? Math.round((w / (h / 100) ** 2) * 10) / 10 : undefined);

export default function HealthPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState('profile');
  const [student, setStudent] = useState<Picked>();

  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Hồ sơ y tế học sinh chỉ dành cho nhân viên y tế và văn phòng nhà trường." />;
  }

  return (
    <>
      <PageHeader title="Y tế học đường" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'profile', label: 'Hồ sơ học sinh', children: <ProfileTab student={student} onStudent={setStudent} /> },
          { key: 'checks', label: 'Khám sức khỏe theo lớp', children: <ClassChecksTab /> },
          { key: 'incidents', label: 'Sự cố y tế', children: <IncidentsTab /> },
          {
            key: 'insurance',
            label: 'BHYT sắp hết hạn',
            children: (
              <InsuranceTab
                onOpen={(s) => {
                  setStudent(s);
                  setTab('profile');
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}

function StudentSelect({ value, onChange, initial, style }: { value?: string; onChange?: (value?: string, option?: any) => void; initial?: Picked; style?: CSSProperties }) {
  const [q, setQ] = useState('');
  const { data } = useSWR<any>(['/students', { q, pageSize: 20 }]);
  const opts: Picked[] = data?.items.map((s: any) => ({ value: s.id, label: studentLabel(s) })) ?? [];
  if (initial && !opts.some((o) => o.value === initial.value)) opts.unshift(initial);
  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      value={value}
      onSearch={setQ}
      onChange={(v, o) => onChange?.(v, o)}
      placeholder="Tìm học sinh theo tên hoặc mã"
      options={opts}
      style={{ width: 340, ...style }}
    />
  );
}

function ProfileTab({ student, onStudent }: { student?: Picked; onStudent: (s?: Picked) => void }) {
  const { message } = App.useApp();
  const { data, mutate } = useSWR<any>(student ? [`/health/students/${student.value}`] : null);
  const [check, setCheck] = useState<any | null>(null);
  const [incident, setIncident] = useState<any | null>(null);
  const [vaccinating, setVaccinating] = useState(false);

  async function remove(path: string) {
    try {
      await api(path, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <StudentSelect value={student?.value} initial={student} onChange={(v, o) => onStudent(v ? { value: v, label: o.label } : undefined)} style={{ marginBottom: 16 }} />
      {!data ? (
        <Empty description="Chọn học sinh để xem hồ sơ sức khỏe" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={9}>
            <Card size="small" title={`Hồ sơ: ${data.student.fullName} (${data.student.code})${data.student.class ? ` · Lớp ${data.student.class.name}` : ''}`}>
              <ProfileForm key={data.student.id} studentId={data.student.id} profile={data.profile} onSaved={() => mutate()} />
            </Card>
          </Col>
          <Col xs={24} lg={15}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                size="small"
                title="Lịch sử khám sức khỏe"
                extra={
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setCheck({ studentId: data.student.id })}>
                    Thêm lượt khám
                  </Button>
                }
              >
                <ChecksTable rows={data.checks} onEdit={setCheck} onDelete={(id) => remove(`/health/checks/${id}`)} />
              </Card>
              <Card
                size="small"
                title="Tiêm chủng"
                extra={
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setVaccinating(true)}>
                    Thêm mũi tiêm
                  </Button>
                }
              >
                <Table<any>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={data.vaccinations}
                  columns={[
                    { title: 'Ngày tiêm', dataIndex: 'givenAt', width: 110, render: fmt },
                    { title: 'Vắc xin', dataIndex: 'vaccine' },
                    { title: 'Mũi', dataIndex: 'dose', width: 60 },
                    { title: 'Ghi chú', dataIndex: 'notes' },
                    {
                      title: '',
                      width: 50,
                      render: (_, r) => (
                        <Popconfirm title="Xóa mũi tiêm này?" onConfirm={() => remove(`/health/vaccinations/${r.id}`)}>
                          <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </Card>
              <Card
                size="small"
                title="Sự cố y tế"
                extra={
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setIncident({ studentId: data.student.id })}>
                    Ghi nhận sự cố
                  </Button>
                }
              >
                <Table<any>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={data.incidents}
                  columns={[
                    { title: 'Thời gian', dataIndex: 'occurredAt', width: 140, render: fmtTime },
                    { title: 'Mức độ', dataIndex: 'severity', width: 110, render: (s) => <Tag color={INCIDENT_SEVERITY[s].color}>{INCIDENT_SEVERITY[s].label}</Tag> },
                    { title: 'Mô tả', dataIndex: 'description' },
                    { title: 'Xử lý', dataIndex: 'treatment' },
                    { title: '', width: 50, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => setIncident(r)} aria-label="Sửa" /> },
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      )}
      <CheckModal record={check} onClose={() => setCheck(null)} onSaved={() => mutate()} />
      <IncidentModal record={incident} onClose={() => setIncident(null)} onSaved={() => mutate()} />
      {data && <VaccinationModal open={vaccinating} studentId={data.student.id} onClose={() => setVaccinating(false)} onSaved={() => mutate()} />}
    </>
  );
}

function ProfileForm({ studentId, profile, onSaved }: { studentId: string; profile: any; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ ...profile, insuranceExpiry: profile?.insuranceExpiry ? dayjs(profile.insuranceExpiry) : undefined });
  }, [form, profile]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/health/students/${studentId}/profile`, {
        method: 'PUT',
        body: clean({ ...values, insuranceExpiry: values.insuranceExpiry?.format('YYYY-MM-DD') }),
      });
      message.success('Đã lưu hồ sơ sức khỏe');
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Form form={form} layout="vertical">
      <Form.Item name="bloodType" label="Nhóm máu">
        <Select options={BLOOD_TYPES} allowClear style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="allergies" label="Dị ứng">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="chronicConditions" label="Bệnh mãn tính / lưu ý">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Space wrap>
        <Form.Item
          name="insuranceNumber"
          label="Mã thẻ BHYT"
          rules={[{ pattern: /^(?:[A-Za-z0-9]{10}|[A-Za-z0-9]{15})$/, message: 'Gồm 10 hoặc 15 chữ/số' }]}
          normalize={(v) => v?.toUpperCase().trim()}
        >
          <Input style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="insuranceExpiry" label="Hạn thẻ BHYT">
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
      </Space>
      <Form.Item name="notes" label="Ghi chú">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Button type="primary" onClick={save}>
        Lưu hồ sơ
      </Button>
    </Form>
  );
}

function ChecksTable({ rows, loading, showStudent, onEdit, onDelete, pagination }: { rows?: any[]; loading?: boolean; showStudent?: boolean; onEdit: (r: any) => void; onDelete?: (id: string) => void; pagination?: any }) {
  return (
    <Table<any>
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      pagination={pagination ?? false}
      scroll={{ x: 800 }}
      columns={[
        { title: 'Ngày khám', dataIndex: 'checkedAt', width: 100, render: fmt },
        ...(showStudent
          ? [
              { title: 'Mã HS', width: 100, render: (_: unknown, r: any) => r.student.code },
              { title: 'Họ và tên', render: (_: unknown, r: any) => r.student.fullName },
              { title: 'Lớp', width: 70, render: (_: unknown, r: any) => r.student.class?.name },
            ]
          : []),
        { title: 'Chiều cao (cm)', dataIndex: 'heightCm', width: 100 },
        { title: 'Cân nặng (kg)', dataIndex: 'weightKg', width: 100 },
        { title: 'BMI', dataIndex: 'bmi', width: 70 },
        { title: 'Thị lực T/P', width: 100, render: (_, r) => [r.visionLeft, r.visionRight].filter(Boolean).join(' · ') },
        { title: 'Răng miệng', dataIndex: 'dental' },
        { title: 'Kết luận', dataIndex: 'conclusion' },
        {
          title: '',
          width: 90,
          render: (_, r) => (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(r)} aria-label="Sửa" />
              {onDelete && (
                <Popconfirm title="Xóa lượt khám này?" onConfirm={() => onDelete(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ]}
    />
  );
}

/** `record` is null when closed, `{ studentId }` to add, or an existing check to edit. */
function CheckModal({ record, onClose, onSaved }: { record: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const height = Form.useWatch('heightCm', form);
  const weight = Form.useWatch('weightKg', form);

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(record.id ? { ...record, checkedAt: dayjs(record.checkedAt) } : { checkedAt: dayjs() });
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({ ...values, checkedAt: values.checkedAt.format('YYYY-MM-DD') });
    try {
      if (record.id) await api(`/health/checks/${record.id}`, { method: 'PATCH', body });
      else await api('/health/checks', { method: 'POST', body: { ...body, studentId: record.studentId } });
      message.success('Đã lưu lượt khám');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={record?.id ? 'Sửa lượt khám' : 'Thêm lượt khám sức khỏe'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="checkedAt" label="Ngày khám" rules={[{ required: true }]}>
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Space wrap>
          <Form.Item name="heightCm" label="Chiều cao (cm)">
            <InputNumber min={30} max={250} step={0.5} />
          </Form.Item>
          <Form.Item name="weightKg" label="Cân nặng (kg)">
            <InputNumber min={2} max={250} step={0.1} />
          </Form.Item>
          <Form.Item label="BMI">
            <Input value={bmi(height, weight) ?? ''} disabled style={{ width: 80 }} />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item name="visionLeft" label="Thị lực mắt trái">
            <Input placeholder="10/10" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="visionRight" label="Thị lực mắt phải">
            <Input placeholder="10/10" style={{ width: 120 }} />
          </Form.Item>
        </Space>
        <Form.Item name="dental" label="Răng miệng">
          <Input />
        </Form.Item>
        <Form.Item name="conclusion" label="Kết luận của nhân viên y tế">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function VaccinationModal({ open, studentId, onClose, onSaved }: { open: boolean; studentId: string; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  async function save() {
    const values = await form.validateFields();
    try {
      await api('/health/vaccinations', { method: 'POST', body: clean({ ...values, studentId, givenAt: values.givenAt.format('YYYY-MM-DD') }) });
      message.success('Đã thêm mũi tiêm');
      form.resetFields();
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Thêm mũi tiêm" open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ dose: 1 }}>
        <Form.Item name="vaccine" label="Vắc xin" rules={[{ required: true }]}>
          <Input placeholder="Sởi - Rubella (MR)" />
        </Form.Item>
        <Space wrap>
          <Form.Item name="dose" label="Mũi số">
            <InputNumber min={1} max={10} />
          </Form.Item>
          <Form.Item name="givenAt" label="Ngày tiêm" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="Ghi chú">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** `record` is null when closed, `{}` / `{ studentId }` to add, or an existing incident to edit. */
function IncidentModal({ record, onClose, onSaved }: { record: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const pickStudent = record && !record.id && !record.studentId;

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(record.id ? { ...record, occurredAt: dayjs(record.occurredAt) } : { occurredAt: dayjs(), severity: 'MINOR', guardianNotified: false });
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({ ...values, occurredAt: values.occurredAt.toISOString() });
    try {
      if (record.id) await api(`/health/incidents/${record.id}`, { method: 'PATCH', body });
      else await api('/health/incidents', { method: 'POST', body: { studentId: record.studentId, ...body } });
      message.success('Đã lưu sự cố');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={record?.id ? 'Sửa sự cố y tế' : 'Ghi nhận sự cố y tế'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        {pickStudent && (
          <Form.Item name="studentId" label="Học sinh" rules={[{ required: true }]}>
            <StudentSelect style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Space wrap>
          <Form.Item name="occurredAt" label="Thời gian" rules={[{ required: true }]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item name="severity" label="Mức độ" rules={[{ required: true }]}>
            <Select style={{ width: 160 }} options={Object.entries(INCIDENT_SEVERITY).map(([value, s]) => ({ value, label: s.label }))} />
          </Form.Item>
        </Space>
        <Form.Item name="description" label="Mô tả sự việc" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="treatment" label="Xử lý / sơ cứu">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="guardianNotified" valuePropName="checked">
          <Checkbox>Đã báo phụ huynh</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ClassChecksTab() {
  const { data: classes } = useClasses();
  const [query, setQuery] = useState({ page: 1, pageSize: 50, classId: undefined as string | undefined, from: undefined as string | undefined, to: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/health/checks', query]);
  const [check, setCheck] = useState<any | null>(null);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder="Lớp" allowClear options={classes?.map((c) => ({ value: c.id, label: c.name }))} style={{ width: 140 }} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          onChange={(r) => setQuery({ ...query, from: r?.[0]?.format('YYYY-MM-DD'), to: r?.[1]?.format('YYYY-MM-DD'), page: 1 })}
        />
      </Space>
      <ChecksTable
        showStudent
        rows={data?.items}
        loading={isLoading}
        onEdit={setCheck}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page: number, pageSize: number) => setQuery({ ...query, page, pageSize }) }}
      />
      <CheckModal record={check} onClose={() => setCheck(null)} onSaved={() => mutate()} />
    </>
  );
}

function IncidentsTab() {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', severity: undefined as string | undefined, from: undefined as string | undefined, to: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/health/incidents', query]);
  const [incident, setIncident] = useState<any | null>(null);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên hoặc mã học sinh" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          onChange={(r) => setQuery({ ...query, from: r?.[0]?.format('YYYY-MM-DD'), to: r?.[1]?.format('YYYY-MM-DD'), page: 1 })}
        />
        <Select
          placeholder="Mức độ"
          allowClear
          style={{ width: 150 }}
          options={Object.entries(INCIDENT_SEVERITY).map(([value, s]) => ({ value, label: s.label }))}
          onChange={(severity) => setQuery({ ...query, severity, page: 1 })}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIncident({})}>
          Ghi nhận sự cố
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Thời gian', dataIndex: 'occurredAt', width: 140, render: fmtTime },
          { title: 'Học sinh', width: 220, render: (_, r) => studentLabel(r.student) },
          { title: 'Mức độ', dataIndex: 'severity', width: 110, render: (s) => <Tag color={INCIDENT_SEVERITY[s].color}>{INCIDENT_SEVERITY[s].label}</Tag> },
          { title: 'Mô tả', dataIndex: 'description' },
          { title: 'Xử lý', dataIndex: 'treatment' },
          { title: 'Phụ huynh', dataIndex: 'guardianNotified', width: 100, render: (v) => (v ? <Tag color="green">Đã báo</Tag> : <Tag>Chưa báo</Tag>) },
          { title: '', width: 50, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => setIncident(r)} aria-label="Sửa" /> },
        ]}
      />
      <IncidentModal record={incident} onClose={() => setIncident(null)} onSaved={() => mutate()} />
    </>
  );
}

function InsuranceTab({ onOpen }: { onOpen: (s: Picked) => void }) {
  const { data: classes } = useClasses();
  const [query, setQuery] = useState({ page: 1, pageSize: 50, days: 30, classId: undefined as string | undefined });
  const { data, isLoading } = useSWR<any>(['/health/insurance-expiring', query]);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Space.Compact>
          <Button disabled tabIndex={-1}>
            Hết hạn trong
          </Button>
          <InputNumber min={0} max={365} value={query.days} onChange={(days) => setQuery({ ...query, days: days ?? 30, page: 1 })} style={{ width: 80 }} />
          <Button disabled tabIndex={-1}>
            ngày
          </Button>
        </Space.Compact>
        <Select placeholder="Lớp" allowClear options={classes?.map((c) => ({ value: c.id, label: c.name }))} style={{ width: 140 }} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
      </Space>
      <Table<any>
        rowKey={(r) => r.student.id}
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã HS', width: 110, render: (_, r) => r.student.code },
          { title: 'Họ và tên', render: (_, r) => r.student.fullName },
          { title: 'Lớp', width: 80, render: (_, r) => r.student.class?.name },
          { title: 'Mã thẻ BHYT', dataIndex: 'insuranceNumber', width: 180 },
          { title: 'Hạn thẻ', dataIndex: 'insuranceExpiry', width: 110, render: fmt },
          {
            title: 'Tình trạng',
            width: 150,
            render: (_, r) =>
              !r.insuranceNumber || r.daysLeft === null ? (
                <Tag>{r.insuranceNumber ? 'Chưa có hạn thẻ' : 'Chưa có thẻ'}</Tag>
              ) : r.daysLeft < 0 ? (
                <Tag color="red">Đã hết hạn</Tag>
              ) : (
                <Tag color="orange">Còn {r.daysLeft} ngày</Tag>
              ),
          },
          {
            title: '',
            width: 100,
            render: (_, r) => (
              <Button size="small" onClick={() => onOpen({ value: r.student.id, label: studentLabel(r.student) })}>
                Mở hồ sơ
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

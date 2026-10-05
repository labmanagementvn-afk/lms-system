'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { EMPLOYEE_DOCUMENT_KIND, EMPLOYMENT_TYPE, GENDER, LEAVE_TYPE, options, vnd } from '@/lib/labels';
import { EmployeeModal } from './EmployeeModal';
import { LeaveRequestModal } from './LeaveModals';
import { EmployeeStatusTag, ExpiryTag, fmtDate, fmtDateTime, isoDate, LeaveStatusTag, MoneyInput } from './shared';

/** Full personnel file with documents, contracts, work history and leave. */
export function EmployeeDrawer({ employeeId, onClose, onChanged }: { employeeId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
  const { data, mutate } = useSWR<any>(employeeId ? [`/hr/employees/${employeeId}`] : null);
  const [editing, setEditing] = useState<any | null>(null);
  const [doc, setDoc] = useState<any | null>(null);
  const [contract, setContract] = useState<any | null>(null);
  const [addingHistory, setAddingHistory] = useState(false);
  const [requestingLeave, setRequestingLeave] = useState(false);

  function changed() {
    mutate();
    onChanged?.();
  }

  async function remove(path: string) {
    try {
      await api(path, { method: 'DELETE' });
      message.success('Đã xóa');
      changed();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const e = data;
  return (
    <Drawer
      title={
        e ? (
          <Space>
            <span>
              {e.code} · {e.fullName}
            </span>
            <EmployeeStatusTag status={e.status} />
          </Space>
        ) : (
          'Hồ sơ nhân viên'
        )
      }
      open={!!employeeId}
      onClose={onClose}
      width={900}
      extra={
        e && (
          <Button icon={<EditOutlined />} onClick={() => setEditing(e)}>
            Sửa hồ sơ
          </Button>
        )
      }
    >
      {e && (
        <Tabs
          items={[
            {
              key: 'profile',
              label: 'Hồ sơ',
              children: (
                <Descriptions
                  size="small"
                  column={2}
                  bordered
                  items={[
                    { label: 'Giới tính', children: e.gender ? GENDER[e.gender] : '' },
                    { label: 'Ngày sinh', children: fmtDate(e.dateOfBirth) },
                    { label: 'Số CCCD', children: e.idNumber },
                    { label: 'Điện thoại', children: e.phone },
                    { label: 'Email', children: e.email },
                    { label: 'Địa chỉ', children: e.address },
                    { label: 'Bộ phận', children: e.department },
                    { label: 'Chức vụ', children: e.position },
                    { label: 'Hình thức', children: EMPLOYMENT_TYPE[e.employmentType] },
                    { label: 'Ngày vào làm', children: fmtDate(e.hireDate) },
                    { label: 'Giáo viên', children: e.teacher ? <Tag color="blue">Liên kết GV {e.teacher.code}</Tag> : <Typography.Text type="secondary">Không</Typography.Text> },
                    {
                      label: 'Tài khoản',
                      children: e.user ? `${e.user.email ?? ''}${e.user.isActive ? '' : ' (đã khóa)'}` : <Typography.Text type="secondary">Chưa có</Typography.Text>,
                    },
                    { label: 'Ghi chú', children: e.notes, span: 2 },
                  ]}
                />
              ),
            },
            {
              key: 'documents',
              label: `Giấy tờ (${e.documents.length})`,
              children: (
                <>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setDoc({})} style={{ marginBottom: 12 }}>
                    Thêm giấy tờ
                  </Button>
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={e.documents}
                    columns={[
                      { title: 'Loại', dataIndex: 'kind', width: 110, render: (k) => EMPLOYEE_DOCUMENT_KIND[k] },
                      { title: 'Tên giấy tờ', dataIndex: 'name', render: (n, r) => (r.fileUrl ? <a href={r.fileUrl} target="_blank" rel="noreferrer">{n}</a> : n) },
                      { title: 'Nơi cấp', dataIndex: 'issuer' },
                      { title: 'Ngày cấp', dataIndex: 'issuedAt', width: 110, render: fmtDate },
                      { title: 'Hạn', width: 160, render: (_, r) => <ExpiryTag date={r.expiresAt} daysLeft={r.daysLeft} /> },
                      {
                        title: '',
                        width: 90,
                        render: (_, r) => (
                          <Space>
                            <Button size="small" icon={<EditOutlined />} onClick={() => setDoc(r)} aria-label="Sửa" />
                            <Popconfirm title="Xóa giấy tờ này?" onConfirm={() => remove(`/hr/documents/${r.id}`)}>
                              <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'contracts',
              label: `Hợp đồng (${e.contracts.length})`,
              children: (
                <>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setContract({})} style={{ marginBottom: 12 }}>
                    Thêm hợp đồng
                  </Button>
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={e.contracts}
                    columns={[
                      { title: 'Loại', dataIndex: 'type', width: 140, render: (t) => EMPLOYMENT_TYPE[t] },
                      { title: 'Từ ngày', dataIndex: 'startDate', width: 110, render: fmtDate },
                      { title: 'Đến ngày', width: 160, render: (_, r) => <ExpiryTag date={r.endDate} daysLeft={r.daysLeft} /> },
                      { title: 'Lương (₫/tháng)', dataIndex: 'salary', width: 140, align: 'right', render: (v) => (v != null ? vnd(v) : '') },
                      { title: 'Ghi chú', dataIndex: 'notes' },
                      {
                        title: '',
                        width: 90,
                        render: (_, r) => (
                          <Space>
                            <Button size="small" icon={<EditOutlined />} onClick={() => setContract(r)} aria-label="Sửa" />
                            <Popconfirm title="Xóa hợp đồng này?" onConfirm={() => remove(`/hr/contracts/${r.id}`)}>
                              <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'history',
              label: `Quá trình công tác (${e.workHistory.length})`,
              children: (
                <>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingHistory(true)} style={{ marginBottom: 12 }}>
                    Thêm quá trình
                  </Button>
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={e.workHistory}
                    columns={[
                      { title: 'Từ', dataIndex: 'fromDate', width: 110, render: fmtDate },
                      { title: 'Đến', dataIndex: 'toDate', width: 110, render: (d) => (d ? fmtDate(d) : 'Nay') },
                      { title: 'Đơn vị', dataIndex: 'organization' },
                      { title: 'Vị trí', dataIndex: 'position' },
                      { title: 'Ghi chú', dataIndex: 'notes' },
                      {
                        title: '',
                        width: 50,
                        render: (_, r) => (
                          <Popconfirm title="Xóa dòng này?" onConfirm={() => remove(`/hr/history/${r.id}`)}>
                            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'leave',
              label: `Nghỉ phép (${e.leaves.length})`,
              children: (
                <>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setRequestingLeave(true)} style={{ marginBottom: 12 }}>
                    Tạo đơn nghỉ phép
                  </Button>
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={e.leaves}
                    columns={[
                      { title: 'Loại', dataIndex: 'type', width: 140, render: (t) => LEAVE_TYPE[t] },
                      { title: 'Thời gian', width: 200, render: (_, r) => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
                      { title: 'Số ngày', dataIndex: 'days', width: 80, align: 'right' },
                      { title: 'Lý do', dataIndex: 'reason' },
                      { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (s) => <LeaveStatusTag status={s} /> },
                      { title: 'Quyết định', render: (_, r) => (r.decidedAt ? `${fmtDateTime(r.decidedAt)}${r.decisionNote ? ` · ${r.decisionNote}` : ''}` : '') },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      )}
      <EmployeeModal record={editing} onClose={() => setEditing(null)} onSaved={changed} />
      {e && <DocumentModal employeeId={e.id} record={doc} onClose={() => setDoc(null)} onSaved={changed} />}
      {e && <ContractModal employeeId={e.id} record={contract} onClose={() => setContract(null)} onSaved={changed} />}
      {e && <HistoryModal employeeId={e.id} open={addingHistory} onClose={() => setAddingHistory(false)} onSaved={changed} />}
      {e && <LeaveRequestModal open={requestingLeave} employeeId={e.id} onClose={() => setRequestingLeave(false)} onSaved={changed} />}
    </Drawer>
  );
}

/** `record` is null when closed, `{}` to add, or an existing document to edit. */
function DocumentModal({ employeeId, record, onClose, onSaved }: { employeeId: string; record: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(
      record.id
        ? { ...record, issuedAt: record.issuedAt ? dayjs(record.issuedAt) : undefined, expiresAt: record.expiresAt ? dayjs(record.expiresAt) : undefined }
        : { kind: 'DEGREE' },
    );
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body = clean({ ...values, issuedAt: isoDate(values.issuedAt), expiresAt: isoDate(values.expiresAt) });
    try {
      if (record.id) await api(`/hr/documents/${record.id}`, { method: 'PATCH', body: { ...body, expiresAt: body.expiresAt ?? null } });
      else await api(`/hr/employees/${employeeId}/documents`, { method: 'POST', body });
      message.success('Đã lưu giấy tờ');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={record?.id ? 'Sửa giấy tờ' : 'Thêm giấy tờ'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="kind" label="Loại" rules={[{ required: true }]}>
            <Select options={options(EMPLOYEE_DOCUMENT_KIND)} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="name" label="Tên giấy tờ" rules={[{ required: true, message: 'Nhập tên giấy tờ' }]}>
            <Input placeholder="Bằng cử nhân Sư phạm Toán" style={{ width: 320 }} />
          </Form.Item>
        </Space>
        <Form.Item name="issuer" label="Nơi cấp">
          <Input />
        </Form.Item>
        <Space wrap>
          <Form.Item name="issuedAt" label="Ngày cấp">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="expiresAt" label="Ngày hết hạn" tooltip="Để trống nếu không có thời hạn">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="fileUrl" label="Đường dẫn file scan">
          <Input placeholder="https://…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ContractModal({ employeeId, record, onClose, onSaved }: { employeeId: string; record: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(
      record.id
        ? { ...record, startDate: dayjs(record.startDate), endDate: record.endDate ? dayjs(record.endDate) : undefined }
        : { type: 'FULL_TIME', startDate: dayjs() },
    );
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body = clean({ ...values, startDate: isoDate(values.startDate), endDate: isoDate(values.endDate) });
    try {
      if (record.id) await api(`/hr/contracts/${record.id}`, { method: 'PATCH', body: { ...body, endDate: body.endDate ?? null } });
      else await api(`/hr/employees/${employeeId}/contracts`, { method: 'POST', body });
      message.success('Đã lưu hợp đồng');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={record?.id ? 'Sửa hợp đồng' : 'Thêm hợp đồng'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="type" label="Loại hợp đồng" rules={[{ required: true }]}>
            <Select options={options(EMPLOYMENT_TYPE)} style={{ width: 170 }} />
          </Form.Item>
          <Form.Item name="salary" label="Lương cơ bản (₫/tháng)">
            <MoneyInput />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="endDate" label="Đến ngày" tooltip="Để trống với hợp đồng không xác định thời hạn">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function HistoryModal({ employeeId, open, onClose, onSaved }: { employeeId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/hr/employees/${employeeId}/history`, { method: 'POST', body: clean({ ...values, fromDate: isoDate(values.fromDate), toDate: isoDate(values.toDate) }) });
      message.success('Đã thêm quá trình công tác');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Thêm quá trình công tác" open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Space wrap>
          <Form.Item name="fromDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="toDate" label="Đến ngày" tooltip="Để trống nếu đang tiếp diễn">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="organization" label="Đơn vị công tác" rules={[{ required: true, message: 'Nhập đơn vị' }]}>
          <Input placeholder="Trường THCS Nguyễn Du" />
        </Form.Item>
        <Form.Item name="position" label="Vị trí" rules={[{ required: true, message: 'Nhập vị trí' }]}>
          <Input placeholder="Giáo viên Toán" />
        </Form.Item>
        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

'use client';

import { App, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { api, clean } from '@/lib/api';
import { useAllTeachers } from '@/lib/hooks';
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE, GENDER, options } from '@/lib/labels';
import { isoDate } from './shared';

const statusOptions = Object.entries(EMPLOYEE_STATUS).map(([value, s]) => ({ value, label: s.label }));

/** `record` is null when closed, `{}` to create, or an existing employee to edit. */
export function EmployeeModal({ record, onClose, onSaved }: { record: any | null; onClose: () => void; onSaved: (employee: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { data: teachers } = useAllTeachers();
  const editing = !!record?.id;

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(
      record.id
        ? {
            ...record,
            dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : undefined,
            hireDate: record.hireDate ? dayjs(record.hireDate) : undefined,
            teacherId: record.teacherId ?? undefined,
          }
        : { employmentType: 'FULL_TIME', status: 'ACTIVE' },
    );
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body = clean({ ...values, dateOfBirth: isoDate(values.dateOfBirth), hireDate: isoDate(values.hireDate) });
    try {
      const saved = editing ? await api(`/hr/employees/${record.id}`, { method: 'PATCH', body }) : await api('/hr/employees', { method: 'POST', body });
      message.success('Đã lưu hồ sơ nhân viên');
      onClose();
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={editing ? `Sửa hồ sơ: ${record.fullName}` : 'Thêm nhân viên'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" width={720} forceRender>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="code" label="Mã nhân viên" tooltip="Để trống để tự sinh NV001, NV002…">
            <Input placeholder="Tự sinh" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input style={{ width: 280 }} />
          </Form.Item>
          <Form.Item name="gender" label="Giới tính">
            <Select allowClear options={options(GENDER)} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="dateOfBirth" label="Ngày sinh">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item name="idNumber" label="Số CCCD">
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input style={{ width: 260 }} />
          </Form.Item>
        </Space>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="department" label="Bộ phận">
            <Input placeholder="Hành chính, Giáo viên…" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="position" label="Chức vụ" rules={[{ required: true, message: 'Nhập chức vụ' }]}>
            <Input placeholder="Kế toán, Giáo viên…" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="employmentType" label="Hình thức">
            <Select options={options(EMPLOYMENT_TYPE)} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="hireDate" label="Ngày vào làm">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          {editing && (
            <Form.Item name="status" label="Trạng thái">
              <Select options={statusOptions} style={{ width: 160 }} />
            </Form.Item>
          )}
          <Form.Item name="teacherId" label="Liên kết giáo viên" tooltip="Dùng chung tài khoản đăng nhập của giáo viên">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Không liên kết"
              style={{ width: 300 }}
              options={teachers?.items.map((t) => ({ value: t.id, label: `${t.code} · ${t.fullName}` }))}
            />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

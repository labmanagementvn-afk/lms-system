'use client';

import { App, DatePicker, Divider, Form, Input, Modal, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { api, clean } from '@/lib/api';
import { GENDER, options, RELATIONSHIP } from '@/lib/labels';

/** `record` is null when closed, `{ roundId? }` to add a manual application, or an existing one to edit. */
export function ApplicationFormModal({ record, rounds, onClose, onSaved }: { record: any | null; rounds?: any[]; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(
      record.id
        ? { ...record, dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : undefined }
        : { roundId: record.roundId, guardianRelationship: 'FATHER' },
    );
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({ ...values, dateOfBirth: values.dateOfBirth?.format('YYYY-MM-DD') });
    try {
      if (record.id) {
        delete body.roundId;
        await api(`/admissions/applications/${record.id}`, { method: 'PATCH', body });
      } else await api('/admissions/applications', { method: 'POST', body });
      message.success('Đã lưu hồ sơ');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={record?.id ? `Sửa hồ sơ ${record.code}` : 'Thêm hồ sơ (nhập tay)'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" width={640} forceRender>
      <Form form={form} layout="vertical">
        {!record?.id && (
          <Form.Item name="roundId" label="Đợt tuyển sinh" rules={[{ required: true, message: 'Chọn đợt tuyển sinh' }]}>
            <Select options={rounds?.filter((r) => r.status === 'OPEN').map((r) => ({ value: r.id, label: r.name }))} placeholder="Chọn đợt" />
          </Form.Item>
        )}
        <Divider orientation="left" plain>
          Học sinh
        </Divider>
        <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Space wrap>
          <Form.Item name="gender" label="Giới tính">
            <Select options={options(GENDER)} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="dateOfBirth" label="Ngày sinh" rules={[{ required: true, message: 'Chọn ngày sinh' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="previousSchool" label="Trường đang học">
            <Input style={{ width: 240 }} maxLength={200} />
          </Form.Item>
        </Space>
        <Form.Item name="address" label="Địa chỉ">
          <Input maxLength={255} />
        </Form.Item>
        <Divider orientation="left" plain>
          Phụ huynh / người giám hộ
        </Divider>
        <Space wrap>
          <Form.Item name="guardianName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên phụ huynh' }]}>
            <Input style={{ width: 240 }} maxLength={120} />
          </Form.Item>
          <Form.Item name="guardianRelationship" label="Quan hệ">
            <Select options={options(RELATIONSHIP)} style={{ width: 150 }} />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item name="guardianPhone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
            <Input style={{ width: 160 }} inputMode="tel" maxLength={20} />
          </Form.Item>
          <Form.Item name="guardianEmail" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input style={{ width: 240 }} inputMode="email" maxLength={120} />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

'use client';

import { App, DatePicker, Descriptions, Form, Input, Modal, Radio, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { LEAVE_TYPE, options } from '@/lib/labels';
import { EmployeeSelect, employeeLabel, fmtDate, isoDate, workingDays } from './shared';

/**
 * New leave request. `self` posts to /hr/me/leave for the signed-in user; otherwise the office
 * files it for `employeeId`, or picks an employee when none is given.
 */
export function LeaveRequestModal({
  open,
  employeeId,
  self,
  onClose,
  onSaved,
}: {
  open: boolean;
  employeeId?: string;
  self?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const range = Form.useWatch('range', form);
  const days = workingDays(range?.[0], range?.[1]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ type: 'ANNUAL', employeeId });
    }
  }, [form, open, employeeId]);

  async function save() {
    const values = await form.validateFields();
    const body: any = { type: values.type, fromDate: isoDate(values.range[0]), toDate: isoDate(values.range[1]), reason: values.reason };
    try {
      if (self) await api('/hr/me/leave', { method: 'POST', body });
      else await api('/hr/leave', { method: 'POST', body: { ...body, employeeId: values.employeeId } });
      message.success('Đã gửi đơn nghỉ phép');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={self ? 'Xin nghỉ phép' : 'Tạo đơn nghỉ phép'} open={open} onOk={save} onCancel={onClose} okText="Gửi đơn" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        {!self && (
          <Form.Item name="employeeId" label="Nhân viên" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
            <EmployeeSelect disabled={!!employeeId} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="type" label="Loại nghỉ" rules={[{ required: true }]}>
          <Select options={options(LEAVE_TYPE)} style={{ width: 220 }} />
        </Form.Item>
        <Form.Item name="range" label="Thời gian nghỉ" rules={[{ required: true, message: 'Chọn ngày nghỉ' }]} extra={range ? `${days} ngày làm việc (không tính thứ Bảy, Chủ Nhật)` : undefined}>
          <DatePicker.RangePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Nhập lý do' }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Approve or reject a pending request; `leave` is null when closed. */
export function DecideLeaveModal({ leave, onClose, onSaved }: { leave: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (leave) {
      form.resetFields();
      form.setFieldsValue({ status: 'APPROVED' });
    }
  }, [form, leave]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/hr/leave/${leave.id}/decide`, { method: 'POST', body: { status: values.status, ...(values.note ? { note: values.note } : {}) } });
      message.success(values.status === 'APPROVED' ? 'Đã duyệt đơn nghỉ phép' : 'Đã từ chối đơn nghỉ phép');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Xét duyệt đơn nghỉ phép" open={!!leave} onOk={save} onCancel={onClose} okText="Xác nhận" cancelText="Hủy" forceRender>
      {leave && (
        <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Nhân viên">{employeeLabel(leave.employee)}</Descriptions.Item>
          <Descriptions.Item label="Loại nghỉ">{LEAVE_TYPE[leave.type]}</Descriptions.Item>
          <Descriptions.Item label="Thời gian">
            {fmtDate(leave.fromDate)} – {fmtDate(leave.toDate)} ({leave.days} ngày)
          </Descriptions.Item>
          <Descriptions.Item label="Lý do">
            <Typography.Text>{leave.reason}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="status" label="Quyết định" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: 'APPROVED', label: 'Duyệt' },
              { value: 'REJECTED', label: 'Từ chối' },
            ]}
          />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú gửi nhân viên">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

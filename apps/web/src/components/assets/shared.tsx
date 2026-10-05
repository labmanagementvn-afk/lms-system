'use client';

import { App, Form, Input, InputNumber, Modal, Tag } from 'antd';
import { useEffect } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { ASSET_STATUS, AUDIT_STATUS } from '@/lib/labels';

export { EmployeeSelect, employeeLabel, fmtDate, fmtDateTime, isoDate, MoneyInput } from '@/components/hr/shared';

export const useCategories = () => useSWR<any[]>(['/assets/categories']);
export const useSuppliers = () => useSWR<any[]>(['/assets/suppliers']);

/** Statuses the office may set directly; LENT and DISPOSED only come from the loan and dispose flows. */
export const SETTABLE_STATUSES = ['IN_USE', 'IN_STORAGE', 'UNDER_MAINTENANCE'];
export const settableStatusOptions = SETTABLE_STATUSES.map((value) => ({ value, label: ASSET_STATUS[value].label }));

export const AssetStatusTag = ({ status }: { status: string }) => <Tag color={ASSET_STATUS[status]?.color}>{ASSET_STATUS[status]?.label ?? status}</Tag>;
export const AuditStatusTag = ({ status }: { status: string }) => <Tag color={AUDIT_STATUS[status]?.color}>{AUDIT_STATUS[status]?.label ?? status}</Tag>;

export function CategoryModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (category: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ usefulLifeYears: 5 });
    }
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      const created = await api('/assets/categories', { method: 'POST', body: clean(values) });
      message.success('Đã thêm danh mục');
      onClose();
      onSaved(created);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Thêm danh mục tài sản" open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tên danh mục" rules={[{ required: true, message: 'Nhập tên danh mục' }]}>
          <Input placeholder="Máy tính, Bàn ghế, Thiết bị dạy học…" />
        </Form.Item>
        <Form.Item name="usefulLifeYears" label="Số năm khấu hao mặc định" tooltip="0 = không khấu hao">
          <InputNumber min={0} max={100} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function SupplierModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (supplier: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      const created = await api('/assets/suppliers', { method: 'POST', body: clean(values) });
      message.success('Đã thêm nhà cung cấp');
      onClose();
      onSaved(created);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Thêm nhà cung cấp" open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tên nhà cung cấp" rules={[{ required: true, message: 'Nhập tên nhà cung cấp' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="taxCode" label="Mã số thuế">
          <Input style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="phone" label="Điện thoại">
          <Input style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

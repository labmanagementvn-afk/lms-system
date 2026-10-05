'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api, clean } from '@/lib/api';
import { CategoryModal, EmployeeSelect, employeeLabel, isoDate, MoneyInput, SETTABLE_STATUSES, settableStatusOptions, SupplierModal, useCategories, useSuppliers } from './shared';

/** `record` is null when closed, `{}` to create, or an existing asset to edit. */
export function AssetModal({ record, onClose, onSaved }: { record: any | null; onClose: () => void; onSaved: (asset: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { data: categories, mutate: mutateCategories } = useCategories();
  const { data: suppliers, mutate: mutateSuppliers } = useSuppliers();
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const categoryId = Form.useWatch('categoryId', form);
  const categoryLife = categories?.find((c) => c.id === categoryId)?.usefulLifeYears;
  const editing = !!record?.id;
  const canSetStatus = !editing || SETTABLE_STATUSES.includes(record.status);

  useEffect(() => {
    if (!record) return;
    form.resetFields();
    form.setFieldsValue(
      record.id
        ? {
            ...record,
            purchaseDate: record.purchaseDate ? dayjs(record.purchaseDate) : undefined,
            supplierId: record.supplierId ?? undefined,
            custodianEmployeeId: record.custodianEmployeeId ?? undefined,
            usefulLifeYears: record.usefulLifeYears ?? undefined,
          }
        : { status: 'IN_USE' },
    );
  }, [form, record]);

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({ ...values, purchaseDate: isoDate(values.purchaseDate) });
    if (!canSetStatus) delete body.status;
    try {
      let saved;
      if (editing) {
        // PATCH: send null so a cleared supplier or custodian is actually removed.
        saved = await api(`/assets/${record.id}`, { method: 'PATCH', body: { ...body, supplierId: values.supplierId ?? null, custodianEmployeeId: values.custodianEmployeeId ?? null } });
      } else {
        saved = await api('/assets', { method: 'POST', body });
      }
      message.success('Đã lưu tài sản');
      onClose();
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={editing ? `Sửa tài sản: ${record.code}` : 'Thêm tài sản'} open={!!record} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" width={760} forceRender>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="code" label="Mã tài sản" tooltip="Để trống để tự sinh TS00001, TS00002…">
            <Input placeholder="Tự sinh" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="name" label="Tên tài sản" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
            <Input style={{ width: 360 }} />
          </Form.Item>
          <Form.Item name="serialNumber" label="Số serial">
            <Input style={{ width: 180 }} />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item label="Danh mục" required>
            <Space.Compact>
              <Form.Item name="categoryId" noStyle rules={[{ required: true, message: 'Chọn danh mục' }]}>
                <Select showSearch optionFilterProp="label" placeholder="Chọn danh mục" style={{ width: 220 }} options={categories?.map((c) => ({ value: c.id, label: `${c.name} (${c.usefulLifeYears} năm)` }))} />
              </Form.Item>
              <Button icon={<PlusOutlined />} onClick={() => setAddingCategory(true)} title="Thêm danh mục" />
            </Space.Compact>
          </Form.Item>
          <Form.Item label="Nhà cung cấp">
            <Space.Compact>
              <Form.Item name="supplierId" noStyle>
                <Select allowClear showSearch optionFilterProp="label" placeholder="Không rõ" style={{ width: 260 }} options={suppliers?.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
              <Button icon={<PlusOutlined />} onClick={() => setAddingSupplier(true)} title="Thêm nhà cung cấp" />
            </Space.Compact>
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item name="purchaseDate" label="Ngày mua">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="purchasePrice" label="Nguyên giá (₫)">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="usefulLifeYears" label="Số năm khấu hao" tooltip="Để trống để dùng mặc định của danh mục">
            <InputNumber min={0} max={100} placeholder={categoryLife != null ? `Mặc định ${categoryLife}` : undefined} style={{ width: 140 }} />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item name="location" label="Vị trí">
            <Input placeholder="Phòng 101" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="custodianEmployeeId" label="Người quản lý / sử dụng">
            <EmployeeSelect style={{ width: 320 }} initial={record?.custodian ? { value: record.custodian.id, label: employeeLabel(record.custodian) } : undefined} />
          </Form.Item>
          {canSetStatus && (
            <Form.Item name="status" label="Trạng thái">
              <Select options={settableStatusOptions} style={{ width: 160 }} />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
      <CategoryModal
        open={addingCategory}
        onClose={() => setAddingCategory(false)}
        onSaved={(c) => {
          mutateCategories();
          form.setFieldsValue({ categoryId: c.id });
        }}
      />
      <SupplierModal
        open={addingSupplier}
        onClose={() => setAddingSupplier(false)}
        onSaved={(s) => {
          mutateSuppliers();
          form.setFieldsValue({ supplierId: s.id });
        }}
      />
    </Modal>
  );
}

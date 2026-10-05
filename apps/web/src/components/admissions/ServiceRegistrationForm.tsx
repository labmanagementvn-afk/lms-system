'use client';

import { Checkbox, Form, FormInstance, Input, InputNumber, Select, Space, Switch } from 'antd';
import { clean } from '@/lib/api';
import { EXTRAS, UNIFORM_SIZES } from './shared';

const sizeOptions = UNIFORM_SIZES.map((s) => ({ value: s, label: s }));

/** Form values <-> API body of a service registration. */
export function registrationToForm(reg: any | null) {
  return {
    canteen: reg?.canteen ?? false,
    bus: reg?.bus ?? false,
    busStopNote: reg?.busStopNote ?? undefined,
    uniform: { shirtSize: reg?.uniform?.shirtSize ?? undefined, pantsSize: reg?.uniform?.pantsSize ?? undefined, quantity: reg?.uniform?.quantity ?? undefined },
    extras: reg?.extras ?? [],
    note: reg?.note ?? undefined,
  };
}

export function formToBody(values: any) {
  const u = values.uniform ?? {};
  return clean({
    canteen: !!values.canteen,
    bus: !!values.bus,
    busStopNote: values.bus ? values.busStopNote : undefined,
    uniform: u.shirtSize || u.pantsSize ? clean(u) : undefined,
    extras: values.extras?.length ? values.extras : undefined,
    note: values.note,
  });
}

/** The fields of a service registration; shared by the parent app and the office's edit drawer. */
export function ServiceRegistrationForm({ form, disabled, compact }: { form: FormInstance; disabled?: boolean; compact?: boolean }) {
  const bus = Form.useWatch('bus', form);
  return (
    <Form form={form} layout="vertical" disabled={disabled} initialValues={registrationToForm(null)}>
      <Form.Item name="canteen" label="Đăng ký bán trú (ăn trưa tại trường)" valuePropName="checked" style={{ marginBottom: 8 }}>
        <Switch checkedChildren="Có" unCheckedChildren="Không" />
      </Form.Item>
      <Form.Item name="bus" label="Đăng ký xe đưa đón" valuePropName="checked" style={{ marginBottom: 8 }}>
        <Switch checkedChildren="Có" unCheckedChildren="Không" />
      </Form.Item>
      {bus && (
        <Form.Item name="busStopNote" label="Điểm đón / trả mong muốn" rules={[{ required: true, message: 'Nhập điểm đón' }]}>
          <Input placeholder="Ví dụ: Ngã tư Láng Hạ - Thái Hà" maxLength={255} />
        </Form.Item>
      )}
      <Form.Item label="Đồng phục" style={{ marginBottom: 0 }}>
        <Space wrap={compact} align="start">
          <Form.Item name={['uniform', 'shirtSize']} label="Size áo">
            <Select options={sizeOptions} allowClear placeholder="Size" style={{ width: 90 }} />
          </Form.Item>
          <Form.Item name={['uniform', 'pantsSize']} label="Size quần">
            <Select options={sizeOptions} allowClear placeholder="Size" style={{ width: 90 }} />
          </Form.Item>
          <Form.Item name={['uniform', 'quantity']} label="Số bộ">
            <InputNumber min={1} max={10} placeholder="1" style={{ width: 80 }} />
          </Form.Item>
        </Space>
      </Form.Item>
      <Form.Item name="extras" label="Dịch vụ / câu lạc bộ khác">
        <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }} options={EXTRAS.map((e) => ({ value: e, label: e }))} />
      </Form.Item>
      <Form.Item name="note" label="Ghi chú cho nhà trường">
        <Input.TextArea rows={2} maxLength={2000} placeholder="Dị ứng thức ăn, lưu ý sức khỏe..." />
      </Form.Item>
    </Form>
  );
}

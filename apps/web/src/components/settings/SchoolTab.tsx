'use client';

import { App, Button, Descriptions, Form, Input, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DISTRICT_LEVEL } from '@/lib/labels';

interface SchoolInfo {
  id: string;
  code: string;
  name: string;
  address: string | null;
  province: string | null;
  moetCode: string | null;
  timezone: string;
  lateAfter: string;
  districtId: string | null;
  district: { id: string; code: string; name: string; level: string; province: string | null } | null;
}

const TIMEZONES = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Vientiane', 'Asia/Phnom_Penh', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];

/** Thông tin trường: name, address, timezone, late cut-off, and the district and MOET code used for reporting. */
export function SchoolTab() {
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const { data, mutate } = useSWR<SchoolInfo>(['/school']);
  const districts = useSWR<{ id: string; code: string; name: string; level: string; province: string | null }[]>(['/districts']);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) form.setFieldsValue({ ...data, districtId: data.districtId ?? undefined });
  }, [data, form]);

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const updated = await api<SchoolInfo>('/school', {
        method: 'PATCH',
        body: { name: v.name, address: v.address ?? '', timezone: v.timezone, lateAfter: v.lateAfter, districtId: v.districtId ?? null, moetCode: v.moetCode ?? '', province: v.province ?? '' },
      });
      mutate(updated, false);
      await refresh();
      message.success('Đã lưu thông tin trường');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Mã trường">{data?.code ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Thuộc">{data?.district ? `${data.district.name} (${DISTRICT_LEVEL[data.district.level] ?? data.district.level})` : 'Chưa gắn với Phòng/Sở'}</Descriptions.Item>
      </Descriptions>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Tên trường" rules={[{ required: true, message: 'Nhập tên trường' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
        <Space size="large" wrap>
          <Form.Item name="timezone" label="Múi giờ" rules={[{ required: true }]} style={{ width: 240 }}>
            <Select showSearch options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="lateAfter" label="Giờ vào học (đến sau là đi muộn)" rules={[{ required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Dạng HH:mm' }]} style={{ width: 200 }}>
            <Input placeholder="07:15" />
          </Form.Item>
        </Space>
        <Typography.Title level={5}>Báo cáo lên Phòng/Sở và CSDL ngành</Typography.Title>
        <Form.Item name="districtId" label="Phòng/Sở GD&ĐT quản lý" extra="Phòng/Sở xem được thống kê ngày, cảnh báo và nhật ký của trường sau khi gắn.">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Chưa gắn"
            options={(districts.data ?? []).map((d) => ({ value: d.id, label: `${d.name}${d.province ? ` · ${d.province}` : ''}` }))}
          />
        </Form.Item>
        <Space size="large" wrap>
          <Form.Item name="moetCode" label="Mã trường trong CSDL ngành" style={{ width: 240 }}>
            <Input placeholder="01-0123-456" />
          </Form.Item>
          <Form.Item name="province" label="Tỉnh / thành phố" style={{ width: 240 }}>
            <Input placeholder="Hà Nội" />
          </Form.Item>
        </Space>
        <div>
          <Button type="primary" loading={saving} onClick={save}>
            Lưu
          </Button>
        </div>
      </Form>
    </div>
  );
}

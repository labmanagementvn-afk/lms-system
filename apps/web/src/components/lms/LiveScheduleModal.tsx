'use client';

import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';

/** Schedule a live room; `courseId` fixes the course (course tab), otherwise the user picks one. */
export function LiveScheduleModal({ open, courseId, onClose, onSaved }: { open: boolean; courseId?: string; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { data: courses } = useSWR<{ items: any[] }>(open && !courseId ? ['/lms/courses', { pageSize: 100, status: 'PUBLISHED' }] : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ courseId, durationMin: 45, startsAt: dayjs().add(1, 'hour').startOf('hour') });
  }, [open, courseId, form]);

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      await api('/lms/live', { method: 'POST', body: { courseId: v.courseId, title: v.title, startsAt: v.startsAt.toISOString(), durationMin: v.durationMin } });
      message.success('Đã lên lịch lớp học');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Lên lịch lớp học trực tuyến" open={open} onOk={save} onCancel={onClose} okText="Lên lịch" cancelText="Hủy" confirmLoading={saving} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="courseId" label="Khóa học" rules={[{ required: true, message: 'Chọn khóa học' }]} hidden={!!courseId}>
          <Select showSearch optionFilterProp="label" options={(courses?.items ?? []).map((c) => ({ value: c.id, label: c.title }))} />
        </Form.Item>
        <Form.Item name="title" label="Tên buổi học" rules={[{ required: true, message: 'Nhập tên buổi học' }]}>
          <Input placeholder="Ôn tập chương 1" />
        </Form.Item>
        <Form.Item name="startsAt" label="Bắt đầu lúc" rules={[{ required: true, message: 'Chọn thời gian' }]}>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: 220 }} />
        </Form.Item>
        <Form.Item name="durationMin" label="Thời lượng (phút)">
          <InputNumber min={5} max={600} step={5} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

'use client';

import { UploadOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { api, apiUpload, clean, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses, useSubjects } from '@/lib/hooks';

/** Create / edit a course: `initial` null creates, an existing course edits. */
export function CourseForm({ open, initial, onClose, onSaved }: { open: boolean; initial: any | null; onClose: () => void; onSaved: (course: any) => void }) {
  const { message } = App.useApp();
  const { me } = useAuth();
  const [form] = Form.useForm();
  const { data: subjects } = useSubjects();
  const { data: classes } = useClasses();
  const { data: teachers } = useAllTeachers();
  const [cover, setCover] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isTeacher = me?.role === 'TEACHER';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setCover(initial?.coverFileId ?? null);
    form.setFieldsValue(
      initial
        ? { title: initial.title, description: initial.description ?? '', subjectId: initial.subjectId ?? undefined, gradeLevel: initial.gradeLevel ?? undefined, classIds: initial.classIds ?? [], teacherId: initial.teacherId }
        : { classIds: [] },
    );
  }, [open, initial, form]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const stored = await apiUpload('/uploads', file);
      setCover(stored.id);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const body = clean({ ...v, coverFileId: cover ?? undefined, teacherId: isTeacher ? undefined : v.teacherId });
      const saved = initial ? await api(`/lms/courses/${initial.id}`, { method: 'PATCH', body }) : await api('/lms/courses', { method: 'POST', body });
      message.success(initial ? 'Đã lưu khóa học' : 'Đã tạo khóa học');
      onClose();
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Sửa khóa học' : 'Tạo khóa học'} open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" confirmLoading={saving} width={640} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Tên khóa học" rules={[{ required: true, message: 'Nhập tên khóa học' }]}>
          <Input placeholder="Toán 6 – Số tự nhiên và phân số" />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="subjectId" label="Môn học">
            <Select allowClear style={{ width: 200 }} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="gradeLevel" label="Khối">
            <InputNumber min={1} max={12} style={{ width: 90 }} />
          </Form.Item>
          {!isTeacher && (
            <Form.Item name="teacherId" label="Giáo viên phụ trách" rules={[{ required: true, message: 'Chọn giáo viên' }]}>
              <Select showSearch optionFilterProp="label" style={{ width: 260 }} options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.code} · ${t.fullName}` }))} />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="classIds" label="Lớp được học" tooltip="Để trống để mở cho toàn trường">
          <Select mode="multiple" allowClear placeholder="Toàn trường" options={(classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
        </Form.Item>
        <Form.Item name="description" label="Mô tả">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Ảnh bìa">
          <Space align="start">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(cover)} alt="" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 6 }} />
            )}
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                upload(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} loading={uploading}>
                {cover ? 'Đổi ảnh' : 'Tải ảnh lên'}
              </Button>
            </Upload>
            {cover && (
              <Button type="link" danger onClick={() => setCover(null)}>
                Bỏ ảnh
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

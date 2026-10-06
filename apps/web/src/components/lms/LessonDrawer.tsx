'use client';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Drawer, Form, Input, InputNumber, Radio, Select, Space, Switch, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, apiUpload, clean } from '@/lib/api';
import { LESSON_TYPE, options } from '@/lib/labels';

type StoredFile = { id: string; name: string; mimeType?: string; launchPath?: string | null };

const ACCEPT: Record<string, string> = { VIDEO: 'video/*', DOCUMENT: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx', SCORM: '.zip' };

/**
 * Add / edit one lesson. `initial` null adds (into `sectionId`), a lesson edits.
 * The type decides which fields show: upload / URL, text, or a test of the course.
 */
export function LessonDrawer({
  courseId,
  sections,
  open,
  initial,
  sectionId,
  onClose,
  onSaved,
}: {
  courseId: string;
  sections: { id: string; title: string }[];
  open: boolean;
  initial: any | null;
  sectionId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [file, setFile] = useState<StoredFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const type: string = Form.useWatch('type', form);
  const videoSource: string = Form.useWatch('videoSource', form);
  // Tests of this course come from the assessments module; fall back to a plain id when the route is unavailable.
  const tests = useSWR<any>(open && type === 'QUIZ' ? ['/lms/tests', { courseId, pageSize: 100 }] : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFile(initial?.file ?? null);
    form.setFieldsValue(
      initial
        ? {
            title: initial.title,
            type: initial.type,
            sectionId: initial.sectionId ?? null,
            content: initial.content ?? '',
            url: initial.url ?? '',
            testId: initial.testId ?? undefined,
            durationMin: initial.durationMin ?? undefined,
            isRequired: initial.isRequired,
            videoSource: initial.type === 'VIDEO' && initial.url ? 'url' : 'upload',
          }
        : { type: 'TEXT', sectionId: sectionId ?? null, isRequired: true, videoSource: 'upload' },
    );
  }, [open, initial, sectionId, form]);

  async function upload(f: File) {
    setUploading(true);
    try {
      setFile(await apiUpload(type === 'SCORM' ? '/uploads/scorm' : '/uploads', f));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const usesFile = v.type === 'DOCUMENT' || v.type === 'SCORM' || (v.type === 'VIDEO' && v.videoSource === 'upload');
    const body = clean({
      sectionId: v.sectionId ?? undefined,
      title: v.title,
      type: v.type,
      content: v.type === 'TEXT' ? v.content : undefined,
      url: ['LINK', 'H5P'].includes(v.type) || (v.type === 'VIDEO' && v.videoSource === 'url') ? v.url : undefined,
      fileId: usesFile ? file?.id : undefined,
      testId: v.type === 'QUIZ' ? v.testId : undefined,
      durationMin: v.durationMin,
      isRequired: v.isRequired,
    });
    setSaving(true);
    try {
      if (initial) await api(`/lms/lessons/${initial.id}`, { method: 'PATCH', body });
      else await api(`/lms/courses/${courseId}/lessons`, { method: 'POST', body });
      message.success('Đã lưu bài học');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const uploader = (label: string) => (
    <Form.Item label={label} required>
      <Space wrap>
        <Upload
          accept={ACCEPT[type]}
          showUploadList={false}
          beforeUpload={(f) => {
            upload(f);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            {file ? 'Chọn tệp khác' : 'Tải tệp lên'}
          </Button>
        </Upload>
        {file && (
          <Typography.Text type="secondary">
            {file.name}
            {type === 'SCORM' && file.launchPath && ` · trang khởi chạy: ${file.launchPath}`}
          </Typography.Text>
        )}
      </Space>
    </Form.Item>
  );

  return (
    <Drawer open={open} onClose={onClose} width={560} destroyOnHidden title={initial ? 'Sửa bài học' : 'Thêm bài học'} extra={<Button type="primary" onClick={save} loading={saving}>Lưu</Button>}>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Tên bài học" rules={[{ required: true, message: 'Nhập tên bài học' }]}>
          <Input />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="type" label="Loại bài học">
            <Select style={{ width: 170 }} options={options(LESSON_TYPE)} onChange={() => setFile(null)} />
          </Form.Item>
          <Form.Item name="sectionId" label="Mục">
            <Select style={{ width: 260 }} options={[{ value: null, label: 'Chưa phân mục' }, ...sections.map((s) => ({ value: s.id, label: s.title }))]} />
          </Form.Item>
        </Space>

        {type === 'VIDEO' && (
          <>
            <Form.Item name="videoSource" label="Nguồn video">
              <Radio.Group
                options={[
                  { value: 'upload', label: 'Tải video lên' },
                  { value: 'url', label: 'Liên kết YouTube' },
                ]}
              />
            </Form.Item>
            {videoSource === 'url' ? (
              <Form.Item name="url" label="Liên kết YouTube" rules={[{ required: true, message: 'Dán liên kết video' }]}>
                <Input placeholder="https://www.youtube.com/watch?v=..." />
              </Form.Item>
            ) : (
              uploader('Tệp video')
            )}
          </>
        )}
        {type === 'DOCUMENT' && uploader('Tài liệu (PDF, Word, PowerPoint)')}
        {type === 'SCORM' && (
          <>
            {uploader('Gói SCORM (.zip)')}
            <Alert type="info" showIcon message="Gói SCORM 1.2 được giải nén trên máy chủ; học sinh học ngay trong trang bài học và tiến độ được ghi lại tự động." style={{ marginBottom: 16 }} />
          </>
        )}
        {(type === 'LINK' || type === 'H5P') && (
          <Form.Item name="url" label={type === 'H5P' ? 'Liên kết nội dung H5P' : 'Đường dẫn'} rules={[{ required: true, message: 'Nhập đường dẫn' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
        )}
        {type === 'TEXT' && (
          <Form.Item name="content" label="Nội dung bài đọc" rules={[{ required: true, message: 'Nhập nội dung' }]} tooltip="Mỗi đoạn văn cách nhau một dòng trống">
            <Input.TextArea rows={12} />
          </Form.Item>
        )}
        {type === 'QUIZ' &&
          (tests.error ? (
            <Form.Item name="testId" label="Mã bài kiểm tra" rules={[{ required: true, message: 'Nhập mã bài kiểm tra' }]} extra="Không tải được danh sách bài kiểm tra; dán mã bài kiểm tra từ trang Bài kiểm tra & cuộc thi.">
              <Input />
            </Form.Item>
          ) : (
            <Form.Item name="testId" label="Bài kiểm tra" rules={[{ required: true, message: 'Chọn bài kiểm tra' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={tests.isLoading}
                placeholder="Chọn đề của khóa học"
                options={(tests.data?.items ?? tests.data ?? []).map((t: any) => ({ value: t.id, label: t.title }))}
              />
            </Form.Item>
          ))}

        <Space wrap align="start">
          <Form.Item name="durationMin" label="Thời lượng (phút)">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="isRequired" label="Bắt buộc" valuePropName="checked" tooltip="Chỉ bài bắt buộc tính vào tiến độ hoàn thành khóa học">
            <Switch />
          </Form.Item>
        </Space>
      </Form>
    </Drawer>
  );
}

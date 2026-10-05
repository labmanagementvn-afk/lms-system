'use client';

import { Alert, App, Checkbox, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { useClasses, useSubjects } from '@/lib/hooks';
import { TEST_KIND } from '@/lib/labels';

interface Values {
  kind: string;
  title: string;
  description?: string;
  subjectId?: string;
  gradeLevel?: number;
  courseId?: string;
  classIds?: string[];
  timeLimitMin?: number | null;
  maxAttempts?: number;
  passPercent?: number | null;
  openAt?: Dayjs | null;
  closeAt?: Dayjs | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
}

/** Create / edit the settings of a test, exam or contest (questions are managed on the test page). */
export function TestForm({ open, initial, defaults, onClose, onSaved }: { open: boolean; initial: any | null; defaults?: { courseId?: string; kind?: string }; onClose: () => void; onSaved: (test: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { data: subjects } = useSubjects();
  const { data: classes } = useClasses();
  const { data: courses } = useSWR<{ items: any[] }>(open ? ['/lms/courses', { pageSize: 100 }] : null);
  const kind = Form.useWatch('kind', form);
  const classIds = Form.useWatch('classIds', form) ?? [];
  const courseId = Form.useWatch('courseId', form);

  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    if (!open) return;
    const defaults = defaultsRef.current;
    form.resetFields();
    form.setFieldsValue(
      initial
        ? {
            kind: initial.kind,
            title: initial.title,
            description: initial.description ?? '',
            subjectId: initial.subjectId ?? undefined,
            gradeLevel: initial.gradeLevel ?? undefined,
            courseId: initial.courseId ?? undefined,
            classIds: initial.classIds ?? [],
            timeLimitMin: initial.timeLimitMin,
            maxAttempts: initial.maxAttempts,
            passPercent: initial.passPercent,
            openAt: initial.openAt ? dayjs(initial.openAt) : null,
            closeAt: initial.closeAt ? dayjs(initial.closeAt) : null,
            shuffleQuestions: initial.shuffleQuestions,
            shuffleOptions: initial.shuffleOptions,
            showResults: initial.showResults,
          }
        : { kind: defaults?.kind ?? 'QUIZ', courseId: defaults?.courseId, classIds: [], timeLimitMin: 15, maxAttempts: 1, passPercent: 50, shuffleQuestions: true, shuffleOptions: true, showResults: true },
    );
  }, [open, initial, form]);

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const body = {
        ...v,
        description: v.description?.trim() ?? '',
        subjectId: v.subjectId ?? null,
        gradeLevel: v.gradeLevel ?? null,
        courseId: v.courseId ?? null,
        classIds: v.classIds ?? [],
        timeLimitMin: v.timeLimitMin ?? null,
        passPercent: v.passPercent ?? null,
        openAt: v.openAt ? v.openAt.toISOString() : null,
        closeAt: v.closeAt ? v.closeAt.toISOString() : null,
      };
      const saved = initial ? await api(`/lms/tests/${initial.id}`, { method: 'PATCH', body }) : await api('/lms/tests', { method: 'POST', body: clean(body) });
      message.success(initial ? 'Đã lưu bài kiểm tra' : 'Đã tạo bài kiểm tra, hãy thêm câu hỏi');
      onClose();
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const audience = classIds.length
    ? `Học sinh của ${classIds.length} lớp đã chọn${courseId ? ' và học sinh của khóa học' : ''} sẽ thấy bài này.`
    : courseId
      ? 'Học sinh đã tham gia khóa học sẽ thấy bài này.'
      : kind === 'CONTEST'
        ? 'Không chọn lớp: cuộc thi mở cho toàn trường.'
        : 'Chưa chọn lớp hay khóa học: học sinh sẽ không thấy bài này.';

  return (
    <Modal title={initial ? 'Sửa bài kiểm tra' : 'Tạo bài kiểm tra'} open={open} onOk={save} onCancel={onClose} okText={initial ? 'Lưu' : 'Tạo'} cancelText="Hủy" confirmLoading={saving} width={720} forceRender>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name="kind" label="Loại" rules={[{ required: true }]}>
              <Select options={Object.entries(TEST_KIND).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }]}>
              <Input maxLength={255} placeholder="Kiểm tra 15 phút – Phân số" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="Mô tả / hướng dẫn làm bài">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={5000} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name="subjectId" label="Môn học">
              <Select allowClear showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gradeLevel" label="Khối">
              <Select allowClear options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="courseId" label="Thuộc khóa học">
              <Select allowClear showSearch optionFilterProp="label" options={(courses?.items ?? []).map((c) => ({ value: c.id, label: c.title }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="classIds" label="Giao cho lớp" extra={audience}>
          <Select mode="multiple" allowClear optionFilterProp="label" options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder={kind === 'CONTEST' ? 'Toàn trường' : 'Chọn lớp'} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={12} md={8}>
            <Form.Item name="timeLimitMin" label="Thời gian làm bài (phút)" extra="Bỏ trống: không giới hạn">
              <InputNumber min={1} max={600} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="maxAttempts" label="Số lần làm tối đa" rules={[{ required: true, message: 'Nhập số lần' }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="passPercent" label="Điểm đạt (%)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={12}>
            <Form.Item name="openAt" label="Mở lúc" extra="Bỏ trống: mở ngay khi giao">
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="closeAt"
              label="Hạn nộp"
              dependencies={['openAt']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value: Dayjs | null) => {
                    const openAt: Dayjs | null = getFieldValue('openAt');
                    return value && openAt && !value.isAfter(openAt) ? Promise.reject(new Error('Hạn nộp phải sau thời gian mở')) : Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="shuffleQuestions" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>Xáo trộn thứ tự câu hỏi cho mỗi học sinh</Checkbox>
        </Form.Item>
        <Form.Item name="shuffleOptions" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>Xáo trộn thứ tự phương án</Checkbox>
        </Form.Item>
        <Form.Item name="showResults" valuePropName="checked">
          <Checkbox>Cho học sinh xem đáp án và lời giải sau khi nộp</Checkbox>
        </Form.Item>
        {initial?.attemptCount > 0 && <Alert type="warning" showIcon message="Đã có học sinh làm bài: thay đổi thời gian, hạn nộp và điểm đạt có hiệu lực ngay với mọi bài làm." />}
      </Form>
    </Modal>
  );
}

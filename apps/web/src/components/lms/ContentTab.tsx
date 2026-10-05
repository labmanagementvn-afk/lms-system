'use client';

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Form, Input, List, Modal, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LESSON_TYPE } from '@/lib/labels';
import { LessonDrawer } from './LessonDrawer';
import { LessonTypeIcon } from './LessonTypeIcon';

type Lesson = { id: string; title: string; type: string; sectionId: string | null; durationMin: number | null; isRequired: boolean; file?: any; test?: any };
type Section = { id: string; title: string; lessons: Lesson[] };
type Layout = { id: string | null; lessonIds: string[] }[];

const move = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

/** The course outline: sections with their lessons, add / edit / delete and move up / down (saved through reorder). */
export function ContentTab({ course, onChanged }: { course: { id: string; sections: Section[]; unsectioned: Lesson[] }; onChanged: () => void }) {
  const { message } = App.useApp();
  const [lesson, setLesson] = useState<{ open: boolean; initial: any | null; sectionId: string | null }>({ open: false, initial: null, sectionId: null });
  const [titleModal, setTitleModal] = useState<{ title: string; initial: string; onOk: (value: string) => Promise<unknown> } | null>(null);

  const groups: { id: string | null; title: string; lessons: Lesson[] }[] = [
    ...course.sections.map((s) => ({ id: s.id, title: s.title, lessons: s.lessons })),
    ...(course.unsectioned.length ? [{ id: null, title: 'Chưa phân mục', lessons: course.unsectioned }] : []),
  ];
  const layout = (): Layout => groups.map((g) => ({ id: g.id, lessonIds: g.lessons.map((l) => l.id) }));

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) message.success(ok);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  const reorder = (sections: Layout) => run(() => api(`/lms/courses/${course.id}/reorder`, { method: 'POST', body: { sections } }));

  const askTitle = (title: string, initial: string, onOk: (value: string) => Promise<unknown>) => setTitleModal({ title, initial, onOk });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Space>
        <Button icon={<PlusOutlined />} onClick={() => askTitle('Thêm mục', '', (title) => api(`/lms/courses/${course.id}/sections`, { method: 'POST', body: { title } }))}>
          Thêm mục
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setLesson({ open: true, initial: null, sectionId: course.sections[0]?.id ?? null })}>
          Thêm bài học
        </Button>
      </Space>
      {!groups.length && <Empty description="Chưa có nội dung. Hãy thêm mục và bài học." />}
      {groups.map((g, gi) => (
        <Card
          key={g.id ?? '__none'}
          size="small"
          title={
            <Space>
              <Typography.Text strong>{g.title}</Typography.Text>
              <Typography.Text type="secondary">({g.lessons.length} bài)</Typography.Text>
            </Space>
          }
          extra={
            g.id && (
              <Space size={4}>
                <Tooltip title="Thêm bài vào mục">
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setLesson({ open: true, initial: null, sectionId: g.id })} />
                </Tooltip>
                <Button size="small" icon={<ArrowUpOutlined />} disabled={gi === 0} onClick={() => reorder(move(layout(), gi, gi - 1))} />
                <Button size="small" icon={<ArrowDownOutlined />} disabled={gi >= course.sections.length - 1} onClick={() => reorder(move(layout(), gi, gi + 1))} />
                <Button size="small" icon={<EditOutlined />} onClick={() => askTitle('Đổi tên mục', g.title, (title) => api(`/lms/sections/${g.id}`, { method: 'PATCH', body: { title } }))} />
                <Popconfirm title="Xóa mục này? Các bài học được giữ lại." okText="Xóa" cancelText="Hủy" onConfirm={() => run(() => api(`/lms/sections/${g.id}`, { method: 'DELETE' }), 'Đã xóa mục')}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        >
          <List
            size="small"
            dataSource={g.lessons}
            locale={{ emptyText: <span style={{ color: '#94a3b8' }}>Chưa có bài học</span> }}
            renderItem={(l, li) => (
              <List.Item
                actions={[
                  <Button key="up" size="small" type="text" icon={<ArrowUpOutlined />} disabled={li === 0} onClick={() => reorder(layout().map((s, i) => (i === gi ? { ...s, lessonIds: move(s.lessonIds, li, li - 1) } : s)))} />,
                  <Button
                    key="down"
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={li === g.lessons.length - 1}
                    onClick={() => reorder(layout().map((s, i) => (i === gi ? { ...s, lessonIds: move(s.lessonIds, li, li + 1) } : s)))}
                  />,
                  <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => setLesson({ open: true, initial: l, sectionId: g.id })} />,
                  <Popconfirm key="del" title="Xóa bài học này?" okText="Xóa" cancelText="Hủy" onConfirm={() => run(() => api(`/lms/lessons/${l.id}`, { method: 'DELETE' }), 'Đã xóa bài học')}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<LessonTypeIcon type={l.type} size={20} />}
                  title={
                    <Space size={6}>
                      <span>
                        {li + 1}. {l.title}
                      </span>
                      {!l.isRequired && <Tag>Tự chọn</Tag>}
                    </Space>
                  }
                  description={[LESSON_TYPE[l.type], l.durationMin ? `${l.durationMin} phút` : null, l.file?.name, l.test?.title, l.type === 'LINK' || l.type === 'H5P' ? (l as any).url : null].filter(Boolean).join(' · ')}
                />
              </List.Item>
            )}
          />
        </Card>
      ))}
      <LessonDrawer
        courseId={course.id}
        sections={course.sections}
        open={lesson.open}
        initial={lesson.initial}
        sectionId={lesson.sectionId}
        onClose={() => setLesson((s) => ({ ...s, open: false }))}
        onSaved={onChanged}
      />
      <TitleModal
        prompt={titleModal}
        onClose={() => setTitleModal(null)}
        onOk={async (value) => {
          await run(() => titleModal!.onOk(value));
          setTitleModal(null);
        }}
      />
    </div>
  );
}

/** Small "name this section" dialog. */
function TitleModal({ prompt, onClose, onOk }: { prompt: { title: string; initial: string } | null; onClose: () => void; onOk: (value: string) => Promise<void> }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (prompt) form.setFieldsValue({ title: prompt.initial });
  }, [prompt, form]);
  return (
    <Modal
      title={prompt?.title}
      open={!!prompt}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Hủy"
      confirmLoading={saving}
      destroyOnHidden
      onOk={async () => {
        const v = await form.validateFields().catch(() => null);
        if (!v) return;
        setSaving(true);
        try {
          await onOk(v.title.trim());
        } finally {
          setSaving(false);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Tên mục" rules={[{ required: true, whitespace: true, message: 'Nhập tên mục' }]}>
          <Input autoFocus placeholder="Chương 1: ..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}

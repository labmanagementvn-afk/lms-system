'use client';

import { ArrowLeftOutlined, DeleteOutlined, LockOutlined, MessageOutlined, PlusOutlined, PushpinOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Card, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ROLE } from '@/lib/labels';
import { formatDateTime } from './format';

type Author = { id: string; fullName: string; role: string };

/**
 * A course's discussion board: thread list, one thread with its posts and a reply box.
 * `base` picks the API prefix ('/lms' for the portal, '/student' for the student app);
 * pin / lock / delete only show when `canModerate`.
 */
export function ThreadView({
  courseId,
  base,
  canModerate,
  tz,
  lessons,
  initialLessonId,
}: {
  courseId: string;
  base: '/lms' | '/student';
  canModerate: boolean;
  tz: string;
  lessons?: { id: string; title: string }[];
  initialLessonId?: string;
}) {
  const { message } = App.useApp();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useSWR<any[]>([`${base}/courses/${courseId}/threads`]);

  useEffect(() => setThreadId(null), [courseId]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) message.success(ok);
      list.mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  if (threadId) {
    return (
      <ThreadDetail
        id={threadId}
        base={base}
        canModerate={canModerate}
        tz={tz}
        onBack={() => {
          setThreadId(null);
          list.mutate();
        }}
        onDeleted={() => {
          setThreadId(null);
          list.mutate();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} style={{ justifySelf: 'start' }}>
        Chủ đề mới
      </Button>
      <List
        loading={list.isLoading}
        dataSource={list.data}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thảo luận nào" /> }}
        renderItem={(t: any) => (
          <List.Item
            style={{ padding: '10px 4px' }}
            actions={
              canModerate
                ? [
                    <Tooltip key="pin" title={t.isPinned ? 'Bỏ ghim' : 'Ghim'}>
                      <Button size="small" type={t.isPinned ? 'primary' : 'text'} icon={<PushpinOutlined />} onClick={() => run(() => api(`/lms/threads/${t.id}`, { method: 'PATCH', body: { isPinned: !t.isPinned } }))} />
                    </Tooltip>,
                    <Tooltip key="lock" title={t.isLocked ? 'Mở khóa' : 'Khóa'}>
                      <Button size="small" type="text" icon={t.isLocked ? <LockOutlined /> : <UnlockOutlined />} onClick={() => run(() => api(`/lms/threads/${t.id}`, { method: 'PATCH', body: { isLocked: !t.isLocked } }))} />
                    </Tooltip>,
                    <Popconfirm key="del" title="Xóa chủ đề và mọi bài viết?" okText="Xóa" cancelText="Hủy" onConfirm={() => run(() => api(`/lms/threads/${t.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            {/* Only the text opens the thread, so the moderation buttons (and their confirm popups) never navigate. */}
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setThreadId(t.id)}>
              <List.Item.Meta
                avatar={<Avatar style={{ background: t.author.role === 'STUDENT' ? '#60a5fa' : '#f59e0b' }}>{t.author.fullName.slice(-1)}</Avatar>}
                title={
                  <Space size={6} wrap>
                    {t.isPinned && <PushpinOutlined style={{ color: '#1677ff' }} />}
                    <span>{t.title}</span>
                    {t.isLocked && <Tag icon={<LockOutlined />}>Đã khóa</Tag>}
                    {t.lesson && <Tag color="geekblue">{t.lesson.title}</Tag>}
                  </Space>
                }
                description={
                  <span>
                    {t.author.fullName} ({ROLE[t.author.role] ?? t.author.role}) · {formatDateTime(t.createdAt, tz)} · <MessageOutlined /> {t.postCount}
                    {t.lastPost && ` · trả lời cuối: ${t.lastPost.author.fullName}, ${formatDateTime(t.lastPost.createdAt, tz)}`}
                  </span>
                }
              />
            </div>
          </List.Item>
        )}
      />
      <NewThreadModal open={creating} base={base} courseId={courseId} lessons={lessons} initialLessonId={initialLessonId} onClose={() => setCreating(false)} onCreated={(t) => (list.mutate(), setThreadId(t.id))} />
    </div>
  );
}

function ThreadDetail({ id, base, canModerate, tz, onBack, onDeleted }: { id: string; base: string; canModerate: boolean; tz: string; onBack: () => void; onDeleted: () => void }) {
  const { message } = App.useApp();
  const { data: t, isLoading, mutate } = useSWR<any>([`${base}/threads/${id}`]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function reply() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api(`${base}/threads/${id}/posts`, { method: 'POST', body: { body: body.trim() } });
      setBody('');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function moderate(fn: () => Promise<unknown>, after?: () => void) {
    try {
      await fn();
      after ? after() : mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const post = (p: { id: string; author: Author; body: string; createdAt: string }, removable: boolean) => (
    <div key={p.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
      <Avatar style={{ background: p.author.role === 'STUDENT' ? '#60a5fa' : '#f59e0b', flexShrink: 0 }}>{p.author.fullName.slice(-1)}</Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>
            <b style={{ color: '#1f2937' }}>{p.author.fullName}</b> · {ROLE[p.author.role] ?? p.author.role} · {formatDateTime(p.createdAt, tz)}
          </span>
          {removable && (
            <Popconfirm title="Xóa bài viết này?" okText="Xóa" cancelText="Hủy" onConfirm={() => moderate(() => api(`/lms/posts/${p.id}`, { method: 'DELETE' }))}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
        <Typography.Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{p.body}</Typography.Paragraph>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Space wrap style={{ justifyContent: 'space-between' }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ padding: 0 }}>
          Danh sách thảo luận
        </Button>
        {canModerate && t && (
          <Space>
            <Button size="small" icon={<PushpinOutlined />} onClick={() => moderate(() => api(`/lms/threads/${id}`, { method: 'PATCH', body: { isPinned: !t.isPinned } }))}>
              {t.isPinned ? 'Bỏ ghim' : 'Ghim'}
            </Button>
            <Button size="small" icon={t.isLocked ? <UnlockOutlined /> : <LockOutlined />} onClick={() => moderate(() => api(`/lms/threads/${id}`, { method: 'PATCH', body: { isLocked: !t.isLocked } }))}>
              {t.isLocked ? 'Mở khóa' : 'Khóa'}
            </Button>
            <Popconfirm title="Xóa chủ đề và mọi bài viết?" okText="Xóa" cancelText="Hủy" onConfirm={() => moderate(() => api(`/lms/threads/${id}`, { method: 'DELETE' }), onDeleted)}>
              <Button size="small" danger icon={<DeleteOutlined />}>
                Xóa
              </Button>
            </Popconfirm>
          </Space>
        )}
      </Space>
      <Card size="small" loading={isLoading}>
        {t && (
          <>
            <Space size={6} wrap>
              {t.isPinned && <PushpinOutlined style={{ color: '#1677ff' }} />}
              <Typography.Title level={5} style={{ margin: 0 }}>
                {t.title}
              </Typography.Title>
              {t.isLocked && <Tag icon={<LockOutlined />}>Đã khóa</Tag>}
              {t.lesson && <Tag color="geekblue">{t.lesson.title}</Tag>}
            </Space>
            {post({ id: t.id, author: t.author, body: t.body, createdAt: t.createdAt }, false)}
            {t.posts.map((p: any) => post(p, canModerate))}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
              {t.isLocked ? (
                <Typography.Text type="secondary">
                  <LockOutlined /> Chủ đề đã khóa, không thể trả lời thêm.
                </Typography.Text>
              ) : (
                <Space.Compact style={{ width: '100%' }} direction="vertical">
                  <Input.TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Viết câu trả lời..." />
                  <Button type="primary" onClick={reply} loading={sending} disabled={!body.trim()} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                    Gửi trả lời
                  </Button>
                </Space.Compact>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function NewThreadModal({
  open,
  base,
  courseId,
  lessons,
  initialLessonId,
  onClose,
  onCreated,
}: {
  open: boolean;
  base: string;
  courseId: string;
  lessons?: { id: string; title: string }[];
  initialLessonId?: string;
  onClose: () => void;
  onCreated: (thread: any) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ lessonId: initialLessonId });
    }
  }, [open, initialLessonId, form]);

  async function save() {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const t = await api(`${base}/courses/${courseId}/threads`, { method: 'POST', body: { title: v.title, body: v.body, ...(v.lessonId ? { lessonId: v.lessonId } : {}) } });
      message.success('Đã tạo chủ đề');
      onClose();
      onCreated(t);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Chủ đề mới" open={open} onOk={save} onCancel={onClose} okText="Đăng" cancelText="Hủy" confirmLoading={saving} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
          <Input />
        </Form.Item>
        {!!lessons?.length && (
          <Form.Item name="lessonId" label="Bài học liên quan">
            <Select allowClear placeholder="Chung cho khóa học" options={lessons.map((l) => ({ value: l.id, label: l.title }))} />
          </Form.Item>
        )}
        <Form.Item name="body" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung' }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

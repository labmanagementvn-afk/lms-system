'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { dmy, NOTE_KIND } from '@/lib/labels';
import { Book, Note } from './types';

/** Theo dõi học sinh: students the teacher follows (needing help, outstanding, improving), what was done and with what result. */
export function BookNotes({ book, refresh }: { book: Book; refresh: () => void }) {
  const { message } = App.useApp();
  const editable = book.editable;
  const [kind, setKind] = useState<string>('ALL');
  const [studentId, setStudentId] = useState<string>();
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [form] = Form.useForm();

  const notes = useMemo(() => book.notes.filter((n) => (kind === 'ALL' || n.kind === kind) && (!studentId || n.student.id === studentId)), [book, kind, studentId]);
  const students = book.students.map((s) => ({ value: s.id, label: s.fullName }));

  function open(n?: Note) {
    form.resetFields();
    if (n) form.setFieldsValue({ studentId: n.student.id, date: dayjs(n.date), kind: n.kind, content: n.content, action: n.action, result: n.result });
    else form.setFieldsValue({ date: dayjs(), kind: kind === 'ALL' ? 'ATTENTION' : kind, studentId });
    setEditing(n ?? 'new');
  }

  async function save() {
    const v = await form.validateFields();
    const body = { classId: book.class.id, studentId: v.studentId, date: v.date.format('YYYY-MM-DD'), kind: v.kind, content: v.content, action: v.action || null, result: v.result || null };
    try {
      if (editing && editing !== 'new') await api(`/homeroom/book/notes/${editing.id}`, { method: 'PATCH', body });
      else await api('/homeroom/book/notes', { method: 'POST', body });
      message.success('Đã lưu');
      setEditing(null);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/homeroom/book/notes/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={kind}
          onChange={(v) => setKind(v as string)}
          options={[{ value: 'ALL', label: `Tất cả (${book.notes.length})` }, ...Object.entries(NOTE_KIND).map(([value, k]) => ({ value, label: `${k.label} (${book.notes.filter((n) => n.kind === value).length})` }))]}
        />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Mọi học sinh" style={{ width: 220 }} value={studentId} onChange={setStudentId} options={students} />
        {editable && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            Ghi theo dõi
          </Button>
        )}
      </Space>
      <Table<Note>
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        dataSource={notes}
        locale={{ emptyText: 'Chưa có ghi chép' }}
        columns={[
          { title: 'Ngày', width: 100, render: (_, n) => dmy(n.date) },
          { title: 'Học sinh', width: 170, render: (_, n) => n.student.fullName },
          { title: 'Diện theo dõi', width: 170, render: (_, n) => <Tag color={NOTE_KIND[n.kind]?.color}>{NOTE_KIND[n.kind]?.label}</Tag> },
          { title: 'Nội dung', dataIndex: 'content' },
          { title: 'Biện pháp giáo dục, giúp đỡ', dataIndex: 'action' },
          { title: 'Kết quả', dataIndex: 'result' },
          ...(editable
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, n: Note) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(n)} aria-label="Sửa" />
                      <Popconfirm title="Xóa ghi chép này?" onConfirm={() => remove(n.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing === 'new' ? 'Ghi theo dõi học sinh' : 'Sửa ghi chép'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="studentId" label="Học sinh" rules={[{ required: true, message: 'Chọn học sinh' }]}>
              <Select showSearch optionFilterProp="label" options={students} style={{ width: 240 }} />
            </Form.Item>
            <Form.Item name="date" label="Ngày" rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d.isBefore(dayjs(book.span.from), 'day') || d.isAfter(dayjs(book.span.to), 'day')} />
            </Form.Item>
          </Space>
          <Form.Item name="kind" label="Diện theo dõi" rules={[{ required: true }]}>
            <Segmented options={Object.entries(NOTE_KIND).map(([value, k]) => ({ value, label: k.label }))} />
          </Form.Item>
          <Form.Item name="content" label="Nội dung theo dõi" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung' }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} placeholder="Biểu hiện, sự việc, hoàn cảnh" />
          </Form.Item>
          <Form.Item name="action" label="Biện pháp giáo dục, giúp đỡ">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} />
          </Form.Item>
          <Form.Item name="result" label="Kết quả">
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

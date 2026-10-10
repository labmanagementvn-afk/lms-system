'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Space, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '@/lib/api';
import { dmy } from '@/lib/labels';
import { Book, Meeting } from './types';

const text = (v: string | null) => (v ? <span style={{ whiteSpace: 'pre-line' }}>{v}</span> : '');

/** Họp cha mẹ học sinh: the minutes of each meeting, with attendance, what parents said and what was agreed. */
export function BookMeetings({ book, refresh }: { book: Book; refresh: () => void }) {
  const { message } = App.useApp();
  const editable = book.editable;
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null);
  const [form] = Form.useForm();

  function open(m?: Meeting) {
    form.resetFields();
    if (m) form.setFieldsValue({ ...m, date: dayjs(m.date) });
    else form.setFieldsValue({ date: dayjs(), invited: book.students.length, title: book.meetings.length ? 'Họp cha mẹ học sinh' : 'Họp cha mẹ học sinh đầu năm học' });
    setEditing(m ?? 'new');
  }

  async function save() {
    const v = await form.validateFields();
    const body = {
      classId: book.class.id,
      date: v.date.format('YYYY-MM-DD'),
      title: v.title,
      invited: v.invited ?? null,
      attended: v.attended ?? null,
      content: v.content,
      opinions: v.opinions || null,
      conclusions: v.conclusions || null,
    };
    try {
      if (editing && editing !== 'new') await api(`/homeroom/book/meetings/${editing.id}`, { method: 'PATCH', body });
      else await api('/homeroom/book/meetings', { method: 'POST', body });
      message.success('Đã lưu biên bản họp');
      setEditing(null);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/homeroom/book/meetings/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      {editable && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open()} style={{ marginBottom: 12 }}>
          Ghi biên bản họp
        </Button>
      )}
      {!book.meetings.length && <Empty description="Chưa có biên bản họp cha mẹ học sinh" />}
      <Space direction="vertical" style={{ width: '100%' }}>
        {book.meetings.map((m) => (
          <Card
            key={m.id}
            size="small"
            title={
              <Space wrap>
                <span>{dmy(m.date)}</span>
                <span>{m.title}</span>
                {m.attended !== null && (
                  <Tag color={m.invited && m.attended < m.invited ? 'orange' : 'green'}>
                    Có mặt {m.attended}
                    {m.invited !== null ? `/${m.invited}` : ''}
                  </Tag>
                )}
              </Space>
            }
            extra={
              editable && (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => open(m)} aria-label="Sửa" />
                  <Popconfirm title="Xóa biên bản này?" onConfirm={() => remove(m.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                </Space>
              )
            }
          >
            <Descriptions size="small" column={1} bordered styles={{ label: { width: 200 } }}>
              <Descriptions.Item label="Nội dung cuộc họp">{text(m.content)}</Descriptions.Item>
              <Descriptions.Item label="Ý kiến của cha mẹ học sinh">{text(m.opinions)}</Descriptions.Item>
              <Descriptions.Item label="Kết luận, thống nhất">{text(m.conclusions)}</Descriptions.Item>
            </Descriptions>
          </Card>
        ))}
      </Space>
      <Modal title={editing === 'new' ? 'Biên bản họp cha mẹ học sinh' : 'Sửa biên bản họp'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={720} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap align="start">
            <Form.Item name="date" label="Ngày họp" rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d.isBefore(dayjs(book.span.from), 'day') || d.isAfter(dayjs(book.span.to), 'day')} />
            </Form.Item>
            <Form.Item name="title" label="Cuộc họp" rules={[{ required: true, whitespace: true }]} style={{ width: 340 }}>
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="invited" label="Số được mời">
              <InputNumber min={0} max={100} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item
              name="attended"
              label="Số có mặt"
              dependencies={['invited']}
              rules={[({ getFieldValue }) => ({ validator: (_, v) => (v != null && getFieldValue('invited') != null && v > getFieldValue('invited') ? Promise.reject(new Error('Nhiều hơn số được mời')) : Promise.resolve()) })]}
            >
              <InputNumber min={0} max={100} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Form.Item name="content" label="Nội dung cuộc họp" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung cuộc họp' }]}>
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} maxLength={5000} />
          </Form.Item>
          <Form.Item name="opinions" label="Ý kiến của cha mẹ học sinh">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 10 }} maxLength={5000} />
          </Form.Item>
          <Form.Item name="conclusions" label="Kết luận, thống nhất">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 10 }} maxLength={5000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

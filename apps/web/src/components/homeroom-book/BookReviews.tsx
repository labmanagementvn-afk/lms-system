'use client';

import { DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Empty, Form, Input, Popconfirm, Space, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { dmy } from '@/lib/labels';
import { Book } from './types';

/** Ý kiến kiểm tra của Ban giám hiệu: the principal and vice principals review the book and write what they found. */
export function BookReviews({ book, refresh }: { book: Book; refresh: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  async function add() {
    const v = await form.validateFields();
    try {
      await api('/homeroom/book/reviews', { method: 'POST', body: { classId: book.class.id, date: v.date?.format('YYYY-MM-DD'), content: v.content } });
      message.success('Đã ghi ý kiến');
      form.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/homeroom/book/reviews/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      {book.canReview && (
        <Card size="small" title="Ghi ý kiến kiểm tra sổ" style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical">
            <Form.Item name="date" label="Ngày kiểm tra" extra="Bỏ trống: hôm nay">
              <DatePicker format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs(book.span.from), 'day') || d.isAfter(dayjs(book.span.to), 'day')} />
            </Form.Item>
            <Form.Item name="content" label="Ý kiến" rules={[{ required: true, whitespace: true, message: 'Nhập ý kiến' }]}>
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} placeholder="Nhận xét việc ghi chép, kế hoạch và công tác chủ nhiệm của lớp" />
            </Form.Item>
            <Button type="primary" icon={<SendOutlined />} onClick={add}>
              Ghi ý kiến
            </Button>
          </Form>
        </Card>
      )}
      {book.reviews.length ? (
        <Timeline
          items={book.reviews.map((r) => ({
            children: (
              <div>
                <Space>
                  <b>{dmy(r.date)}</b>
                  <Typography.Text type="secondary">{r.author}</Typography.Text>
                  {r.mine && (
                    <Popconfirm title="Xóa ý kiến này?" onConfirm={() => remove(r.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xóa ý kiến" />
                    </Popconfirm>
                  )}
                </Space>
                <Typography.Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{r.content}</Typography.Paragraph>
              </div>
            ),
          }))}
        />
      ) : (
        <Empty description="Chưa có ý kiến kiểm tra của Ban giám hiệu" />
      )}
    </>
  );
}

'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Form, Input, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Book, MonthPlan, SaveBook } from './types';

const PARTS = [
  { name: 'situation', label: 'Đặc điểm tình hình lớp', hint: 'Thuận lợi, khó khăn; hoàn cảnh học sinh cần lưu ý' },
  { name: 'goals', label: 'Mục tiêu giáo dục', hint: 'Mục tiêu về nề nếp, học tập, rèn luyện của lớp trong năm học' },
  { name: 'targets', label: 'Chỉ tiêu phấn đấu', hint: 'Kết quả học tập, rèn luyện, chuyên cần, thi đua' },
  { name: 'measures', label: 'Biện pháp thực hiện', hint: 'Cách tổ chức lớp, phối hợp với giáo viên bộ môn và gia đình' },
] as const;

const monthLabel = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;

/** Kế hoạch chủ nhiệm: the plan for the school year and one for each month with its review. */
export function BookPlans({ book, save, refresh }: { book: Book; save: SaveBook; refresh: () => void }) {
  const { message } = App.useApp();
  const editable = book.editable;
  const [plan] = Form.useForm();
  const [month] = Form.useForm();
  const [editing, setEditing] = useState<MonthPlan | 'new' | null>(null);

  useEffect(() => {
    plan.setFieldsValue({ situation: '', goals: '', targets: '', measures: '', ...book.yearPlan });
  }, [book, plan]);

  function open(p?: MonthPlan) {
    month.resetFields();
    if (p) month.setFieldsValue({ month: dayjs(`${p.month}-01`), theme: p.theme, tasks: p.tasks, review: p.review });
    else {
      // The first month of the year without a plan, or this month.
      const taken = new Set(book.monthPlans.map((m) => m.month));
      let m = dayjs(book.span.from).startOf('month');
      while (taken.has(m.format('YYYY-MM')) && m.isBefore(dayjs(book.span.to))) m = m.add(1, 'month');
      month.setFieldsValue({ month: m });
    }
    setEditing(p ?? 'new');
  }

  async function saveMonth() {
    const v = await month.validateFields();
    const key = v.month.format('YYYY-MM');
    if (book.monthPlans.some((m) => m.month === key && (editing === 'new' || m.id !== editing?.id))) {
      message.warning(`${monthLabel(key)} đã có kế hoạch: hãy sửa kế hoạch đó`);
      return;
    }
    try {
      // Moving a plan to another month: write the new month, then drop the old one.
      await api('/homeroom/book/month-plans', { method: 'PUT', body: { classId: book.class.id, month: key, theme: v.theme || null, tasks: v.tasks, review: v.review || null } });
      if (editing && editing !== 'new' && editing.month !== key) await api(`/homeroom/book/month-plans/${editing.id}`, { method: 'DELETE' });
      message.success('Đã lưu kế hoạch tháng');
      setEditing(null);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/homeroom/book/month-plans/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Card
        size="small"
        title={`Kế hoạch chủ nhiệm năm học ${book.class.academicYear.name}`}
        style={{ marginBottom: 16 }}
        extra={
          editable && (
            <Button type="primary" icon={<SaveOutlined />} onClick={async () => save({ yearPlan: await plan.validateFields() }, 'Đã lưu kế hoạch năm học')}>
              Lưu
            </Button>
          )
        }
      >
        {editable ? (
          <Form form={plan} layout="vertical">
            {PARTS.map((p) => (
              <Form.Item key={p.name} name={p.name} label={p.label}>
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 12 }} maxLength={5000} placeholder={p.hint} />
              </Form.Item>
            ))}
          </Form>
        ) : (
          PARTS.map((p) => (
            <div key={p.name} style={{ marginBottom: 12 }}>
              <Typography.Text strong>{p.label}</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 0 }} type={book.yearPlan[p.name] ? undefined : 'secondary'}>
                {book.yearPlan[p.name] || 'Chưa ghi.'}
              </Typography.Paragraph>
            </div>
          ))
        )}
      </Card>
      <Card
        size="small"
        title="Kế hoạch từng tháng"
        extra={
          editable && (
            <Button icon={<PlusOutlined />} onClick={() => open()}>
              Thêm kế hoạch tháng
            </Button>
          )
        }
      >
        <Table<MonthPlan>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={book.monthPlans}
          locale={{ emptyText: 'Chưa có kế hoạch tháng' }}
          columns={[
            { title: 'Tháng', width: 110, render: (_, p) => monthLabel(p.month) },
            { title: 'Chủ điểm', width: 200, dataIndex: 'theme' },
            { title: 'Nội dung công việc', render: (_, p) => <span style={{ whiteSpace: 'pre-line' }}>{p.tasks}</span> },
            { title: 'Đánh giá kết quả', render: (_, p) => <span style={{ whiteSpace: 'pre-line' }}>{p.review}</span> },
            ...(editable
              ? [
                  {
                    title: '',
                    width: 96,
                    render: (_: unknown, p: MonthPlan) => (
                      <Space>
                        <Button size="small" icon={<EditOutlined />} onClick={() => open(p)} aria-label="Sửa" />
                        <Popconfirm title="Xóa kế hoạch tháng này?" onConfirm={() => remove(p.id)}>
                          <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <Modal title={editing === 'new' ? 'Thêm kế hoạch tháng' : 'Sửa kế hoạch tháng'} open={!!editing} onOk={saveMonth} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={640} destroyOnHidden>
        <Form form={month} layout="vertical">
          <Space wrap>
            <Form.Item name="month" label="Tháng" rules={[{ required: true }]}>
              <DatePicker picker="month" format="MM/YYYY" allowClear={false} disabledDate={(d) => d.isBefore(dayjs(book.span.from), 'month') || d.isAfter(dayjs(book.span.to), 'month')} />
            </Form.Item>
            <Form.Item name="theme" label="Chủ điểm" style={{ width: 380 }}>
              <Input maxLength={200} placeholder="Tháng 10: Chăm ngoan, học giỏi" />
            </Form.Item>
          </Space>
          <Form.Item name="tasks" label="Nội dung công việc" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung kế hoạch' }]}>
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} maxLength={5000} />
          </Form.Item>
          <Form.Item name="review" label="Đánh giá kết quả cuối tháng">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

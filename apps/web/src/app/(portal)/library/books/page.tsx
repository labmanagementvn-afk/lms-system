'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { COPY_STATUS } from '@/lib/labels';

export default function BooksPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', category: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/library/books', query]);
  const { data: categories, mutate: mutateCategories } = useSWR<string[]>(['/library/categories']);
  const [editing, setEditing] = useState<any | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const editable = canEditStudents(me);

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    if (record) form.setFieldsValue(record);
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing?.id) await api(`/library/books/${editing.id}`, { method: 'PATCH', body: clean(values) });
      else await api('/library/books', { method: 'POST', body: clean(values) });
      message.success('Đã lưu đầu sách');
      setEditing(null);
      mutate();
      mutateCategories();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/library/books/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Đầu sách thư viện"
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
              Thêm đầu sách
            </Button>
          )
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên sách, tác giả, ISBN" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 300 }} />
        <Select
          placeholder="Thể loại"
          allowClear
          options={categories?.map((c) => ({ value: c, label: c }))}
          style={{ width: 200 }}
          onChange={(category) => setQuery({ ...query, category, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          {
            title: 'Tên sách',
            render: (_, r) => (
              <>
                <Typography.Link onClick={() => setDetailId(r.id)}>{r.title}</Typography.Link>
                {r.author && <div style={{ color: '#888', fontSize: 12 }}>{r.author}</div>}
              </>
            ),
          },
          { title: 'Thể loại', dataIndex: 'category', width: 160 },
          { title: 'ISBN', dataIndex: 'isbn', width: 150 },
          { title: 'Nhà xuất bản', width: 200, render: (_, r) => [r.publisher, r.year].filter(Boolean).join(', ') },
          {
            title: 'Sẵn có / Tổng',
            width: 130,
            render: (_, r) => <Tag color={r.copies.available ? 'green' : r.copies.total ? 'orange' : 'default'}>{`${r.copies.available} / ${r.copies.total}`}</Tag>,
          },
          ...(editable
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, r: any) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                      <Popconfirm title="Xóa đầu sách cùng toàn bộ bản sách và lịch sử mượn?" onConfirm={() => remove(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing?.id ? 'Sửa đầu sách' : 'Thêm đầu sách'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Tên sách" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="author" label="Tác giả">
            <Input />
          </Form.Item>
          <Space wrap>
            <Form.Item name="isbn" label="ISBN">
              <Input style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="category" label="Thể loại">
              <Input style={{ width: 200 }} list="book-categories" />
            </Form.Item>
          </Space>
          <datalist id="book-categories">{categories?.map((c) => <option key={c} value={c} />)}</datalist>
          <Space wrap>
            <Form.Item name="publisher" label="Nhà xuất bản">
              <Input style={{ width: 240 }} />
            </Form.Item>
            <Form.Item name="year" label="Năm xuất bản">
              <InputNumber min={1800} max={2100} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
      <BookDrawer id={detailId} editable={editable} onClose={() => setDetailId(null)} onChanged={() => mutate()} />
    </>
  );
}

function BookDrawer({ id, editable, onClose, onChanged }: { id: string | null; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const { data: book, mutate } = useSWR<any>(id ? [`/library/books/${id}`] : null);
  const [form] = Form.useForm();

  function refresh() {
    mutate();
    onChanged();
  }

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      message.success(done);
      refresh();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  }

  async function addCopies() {
    const { barcodes, shelf } = await form.validateFields();
    const list = String(barcodes)
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (await run(() => api(`/library/books/${id}/copies`, { method: 'POST', body: clean({ barcodes: list, shelf }) }), `Đã thêm ${list.length} bản sách`)) form.resetFields();
  }

  return (
    <Drawer title={book?.title ?? 'Chi tiết đầu sách'} open={!!id} onClose={onClose} width={760} destroyOnHidden>
      {book && (
        <>
          <Descriptions
            size="small"
            column={2}
            items={[
              { label: 'Tác giả', children: book.author },
              { label: 'Thể loại', children: book.category },
              { label: 'ISBN', children: book.isbn },
              { label: 'Nhà xuất bản', children: [book.publisher, book.year].filter(Boolean).join(', ') },
            ]}
          />
          <Divider orientation="left" plain>
            Bản sách ({book.copies.length})
          </Divider>
          <Table<any>
            rowKey="id"
            size="small"
            dataSource={book.copies}
            pagination={false}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Mã vạch', dataIndex: 'barcode', width: 140 },
              { title: 'Vị trí', dataIndex: 'shelf', width: 100 },
              {
                title: 'Trạng thái',
                width: 160,
                render: (_, c) =>
                  editable && c.status !== 'BORROWED' ? (
                    <Select
                      size="small"
                      value={c.status}
                      style={{ width: 130 }}
                      options={['AVAILABLE', 'LOST', 'RETIRED'].map((s) => ({ value: s, label: COPY_STATUS[s].label }))}
                      onChange={(status) => run(() => api(`/library/copies/${c.id}`, { method: 'PATCH', body: { status } }), 'Đã cập nhật')}
                    />
                  ) : (
                    <Tag color={COPY_STATUS[c.status].color}>{COPY_STATUS[c.status].label}</Tag>
                  ),
              },
              {
                title: 'Người mượn',
                render: (_, c) => {
                  if (!c.loan) return '';
                  const who = c.loan.student ?? c.loan.teacher;
                  return (
                    <>
                      {who.fullName} <span style={{ color: '#888' }}>({who.code})</span>
                      <div style={{ fontSize: 12, color: c.loan.overdueDays ? '#cf1322' : '#888' }}>
                        Hạn trả {dayjs(c.loan.dueAt).format('DD/MM/YYYY')}
                        {c.loan.overdueDays > 0 && ` · quá hạn ${c.loan.overdueDays} ngày`}
                      </div>
                    </>
                  );
                },
              },
            ]}
          />
          {editable && (
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
              <Space align="start" wrap>
                <Form.Item name="barcodes" label="Thêm bản sách (mỗi dòng một mã vạch)" rules={[{ required: true, message: 'Nhập ít nhất một mã vạch' }]}>
                  <Input.TextArea rows={4} style={{ width: 300 }} placeholder={'TV000123\nTV000124'} />
                </Form.Item>
                <Form.Item name="shelf" label="Vị trí kệ">
                  <Input style={{ width: 140 }} />
                </Form.Item>
                <Form.Item label=" ">
                  <Button icon={<PlusOutlined />} onClick={addCopies}>
                    Thêm bản sách
                  </Button>
                </Form.Item>
              </Space>
            </Form>
          )}
          <Divider orientation="left" plain>
            Đặt trước ({book.reservations.length})
          </Divider>
          <Table<any>
            rowKey="id"
            size="small"
            dataSource={book.reservations}
            pagination={false}
            locale={{ emptyText: 'Không có học sinh đặt trước' }}
            columns={[
              { title: '#', width: 40, render: (_, __, i) => i + 1 },
              { title: 'Học sinh', render: (_, r) => `${r.student.code} · ${r.student.fullName}` },
              { title: 'Ngày đặt', dataIndex: 'createdAt', width: 140, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
              ...(editable
                ? [
                    {
                      title: '',
                      width: 80,
                      render: (_: unknown, r: any) => (
                        <Popconfirm title="Hủy lượt đặt trước này?" onConfirm={() => run(() => api(`/library/reservations/${r.id}/cancel`, { method: 'POST' }), 'Đã hủy đặt trước')}>
                          <Button size="small" danger>
                            Hủy
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {editable && <ReserveForm bookId={book.id} onDone={refresh} />}
        </>
      )}
    </Drawer>
  );
}

function ReserveForm({ bookId, onDone }: { bookId: string; onDone: () => void }) {
  const { message } = App.useApp();
  const [studentId, setStudentId] = useState<string>();
  const [q, setQ] = useState('');
  const { data } = useSWR<any>(['/students', { q, pageSize: 20 }]);

  async function reserve() {
    try {
      await api('/library/reservations', { method: 'POST', body: { bookId, studentId } });
      message.success('Đã đặt trước');
      setStudentId(undefined);
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Space style={{ marginTop: 12 }} wrap>
      <Select
        showSearch
        allowClear
        filterOption={false}
        value={studentId}
        onSearch={setQ}
        onChange={setStudentId}
        placeholder="Tìm học sinh để đặt trước"
        style={{ width: 320 }}
        options={data?.items.map((s: any) => ({ value: s.id, label: `${s.code} · ${s.fullName}` }))}
      />
      <Button disabled={!studentId} onClick={reserve}>
        Đặt trước
      </Button>
    </Space>
  );
}

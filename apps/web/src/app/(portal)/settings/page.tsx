'use client';

import { DeleteOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAcademicYears, usePeriods, useSubjects } from '@/lib/hooks';
import { options, SESSION } from '@/lib/labels';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Thiết lập" />
      <Tabs
        items={[
          { key: 'years', label: 'Năm học', children: <Years /> },
          { key: 'subjects', label: 'Môn học', children: <Subjects /> },
          { key: 'periods', label: 'Khung giờ tiết học', children: <Periods /> },
        ]}
      />
    </>
  );
}

function Years() {
  const { message } = App.useApp();
  const { data, mutate } = useAcademicYears();
  const [form] = Form.useForm();

  async function add() {
    const v = await form.validateFields();
    try {
      await api('/academic-years', {
        method: 'POST',
        body: { name: v.name, startDate: v.range[0].format('YYYY-MM-DD'), endDate: v.range[1].format('YYYY-MM-DD'), isCurrent: !!v.isCurrent },
      });
      form.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function makeCurrent(id: string) {
    await api(`/academic-years/${id}`, { method: 'PATCH', body: { isCurrent: true } });
    mutate();
  }

  return (
    <>
      <Form form={form} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}>
        <Form.Item name="name" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="2027-2028" />
        </Form.Item>
        <Form.Item name="range" rules={[{ required: true, message: 'Chọn thời gian' }]}>
          <DatePicker.RangePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="isCurrent" valuePropName="checked">
          <Checkbox>Năm học hiện tại</Checkbox>
        </Form.Item>
        <Button type="primary" icon={<PlusOutlined />} onClick={add}>
          Thêm
        </Button>
      </Form>
      <Table<any>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data}
        columns={[
          { title: 'Năm học', dataIndex: 'name' },
          { title: 'Bắt đầu', dataIndex: 'startDate', render: (d) => dayjs(d).format('DD/MM/YYYY') },
          { title: 'Kết thúc', dataIndex: 'endDate', render: (d) => dayjs(d).format('DD/MM/YYYY') },
          {
            title: '',
            render: (_, r) =>
              r.isCurrent ? (
                <Tag color="blue">Hiện tại</Tag>
              ) : (
                <Button size="small" onClick={() => makeCurrent(r.id)}>
                  Đặt làm hiện tại
                </Button>
              ),
          },
        ]}
      />
    </>
  );
}

function Subjects() {
  const { message } = App.useApp();
  const { data, mutate } = useSubjects();
  const [form] = Form.useForm();

  async function add() {
    const v = await form.validateFields();
    try {
      await api('/subjects', { method: 'POST', body: v });
      form.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/subjects/${id}`, { method: 'DELETE' });
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Form form={form} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}>
        <Form.Item name="code" rules={[{ required: true, message: 'Nhập mã' }]}>
          <Input placeholder="Mã (TOAN)" />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="Tên môn (Toán)" />
        </Form.Item>
        <Button type="primary" icon={<PlusOutlined />} onClick={add}>
          Thêm
        </Button>
      </Form>
      <Table<any>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 120 },
          { title: 'Tên môn học', dataIndex: 'name' },
          {
            title: '',
            width: 60,
            render: (_, r) => (
              <Popconfirm title="Xóa môn học?" onConfirm={() => remove(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  );
}

function Periods() {
  const { message } = App.useApp();
  const { data, mutate } = usePeriods();
  const [form] = Form.useForm();

  useEffect(() => {
    if (data) form.setFieldsValue({ periods: data.map(({ number, session, startTime, endTime }) => ({ number, session, startTime, endTime })) });
  }, [data, form]);

  async function save() {
    const v = await form.validateFields();
    try {
      await api('/periods', { method: 'PUT', body: { periods: v.periods ?? [] } });
      message.success('Đã lưu khung giờ');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const hhmm = [{ required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'HH:mm' }];

  return (
    <Form form={form}>
      <Form.List name="periods">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name }) => (
              <Space key={key} wrap align="baseline">
                <Form.Item name={[name, 'number']} rules={[{ required: true }]}>
                  <InputNumber min={1} max={20} addonBefore="Tiết" style={{ width: 130 }} />
                </Form.Item>
                <Form.Item name={[name, 'session']} rules={[{ required: true }]}>
                  <Select options={options(SESSION)} style={{ width: 100 }} />
                </Form.Item>
                <Form.Item name={[name, 'startTime']} rules={hhmm}>
                  <Input placeholder="07:30" style={{ width: 90 }} />
                </Form.Item>
                <Form.Item name={[name, 'endTime']} rules={hhmm}>
                  <Input placeholder="08:15" style={{ width: 90 }} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} aria-label="Bỏ" />
              </Space>
            ))}
            <Space>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ number: fields.length + 1, session: fields.length < 5 ? 'MORNING' : 'AFTERNOON' })}>
                Thêm tiết
              </Button>
              <Button type="primary" onClick={save}>
                Lưu khung giờ
              </Button>
            </Space>
          </>
        )}
      </Form.List>
    </Form>
  );
}

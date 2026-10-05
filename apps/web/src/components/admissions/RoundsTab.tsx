'use client';

import { CopyOutlined, DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAcademicYears } from '@/lib/hooks';
import { ADMISSION_ROUND_STATUS, APPLICATION_STATUS } from '@/lib/labels';
import { fmtDate } from './shared';

const COUNTED = ['SUBMITTED', 'SCREENING', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'];

export function RoundsTab() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>(['/admissions/rounds']);
  const { data: years } = useAcademicYears();
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [link, setLink] = useState('');

  // window is only available after hydration.
  useEffect(() => {
    if (me) setLink(`${window.location.origin}/apply/${me.school.code}`);
  }, [me]);

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(
      record
        ? { ...record, dates: [dayjs(record.startDate), dayjs(record.endDate)] }
        : { gradeLevel: 6, academicYearId: years?.find((y) => y.isCurrent)?.id, dates: [dayjs(), dayjs().add(60, 'day')] },
    );
  }

  async function save() {
    const values = await form.validateFields();
    const { dates, ...rest } = values;
    const body = clean({ ...rest, startDate: dates[0].format('YYYY-MM-DD'), endDate: dates[1].format('YYYY-MM-DD') });
    try {
      if (editing?.id) await api(`/admissions/rounds/${editing.id}`, { method: 'PATCH', body });
      else await api('/admissions/rounds', { method: 'POST', body });
      message.success('Đã lưu đợt tuyển sinh');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      message.success(ok);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      message.success('Đã sao chép liên kết');
    } catch {
      message.info(link);
    }
  }

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap align="center">
          <LinkOutlined />
          <Typography.Text>Trang nộp hồ sơ trực tuyến cho phụ huynh:</Typography.Text>
          <Typography.Link href={link} target="_blank">
            {link}
          </Typography.Link>
          <Button size="small" icon={<CopyOutlined />} onClick={copyLink}>
            Sao chép
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          Phụ huynh chỉ thấy các đợt đang mở và trong thời gian nhận hồ sơ. Vượt chỉ tiêu chỉ cảnh báo, không chặn xét tuyển.
        </Typography.Paragraph>
      </Card>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => open()} style={{ marginBottom: 12 }}>
        Tạo đợt tuyển sinh
      </Button>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: 'Đợt tuyển sinh',
            render: (_, r) => (
              <>
                <div>{r.name}</div>
                {r.description && (
                  <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320, display: 'block' }}>
                    {r.description}
                  </Typography.Text>
                )}
              </>
            ),
          },
          { title: 'Khối', dataIndex: 'gradeLevel', width: 70, align: 'center' },
          { title: 'Năm học', width: 100, render: (_, r) => r.academicYear?.name },
          { title: 'Nhận hồ sơ', width: 200, render: (_, r) => `${fmtDate(r.startDate)} - ${fmtDate(r.endDate)}` },
          {
            title: 'Trúng tuyển / chỉ tiêu',
            width: 150,
            align: 'center',
            render: (_, r) =>
              r.capacity ? (
                <Typography.Text type={r.acceptedCount > r.capacity ? 'danger' : r.acceptedCount === r.capacity ? 'warning' : undefined}>
                  {r.acceptedCount} / {r.capacity}
                </Typography.Text>
              ) : (
                `${r.acceptedCount} / –`
              ),
          },
          {
            title: 'Hồ sơ',
            render: (_, r) => (
              <Space size={4} wrap>
                <strong>{r.total}</strong>
                {COUNTED.filter((s) => r.counts[s]).map((s) => (
                  <Tag key={s} color={APPLICATION_STATUS[s].color}>
                    {APPLICATION_STATUS[s].label}: {r.counts[s]}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 120,
            render: (s, r) => (
              <Tag color={ADMISSION_ROUND_STATUS[s].color}>{s === 'OPEN' && !r.acceptingNow ? 'Mở (ngoài hạn)' : ADMISSION_ROUND_STATUS[s].label}</Tag>
            ),
          },
          {
            title: '',
            width: 150,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                {r.status === 'OPEN' && (
                  <Popconfirm title="Đóng đợt tuyển sinh? Phụ huynh không nộp hồ sơ được nữa." onConfirm={() => run(() => api(`/admissions/rounds/${r.id}/close`, { method: 'POST' }), 'Đã đóng đợt tuyển sinh')}>
                    <Button size="small">Đóng</Button>
                  </Popconfirm>
                )}
                {r.total === 0 && (
                  <Popconfirm title="Xóa đợt tuyển sinh này?" onConfirm={() => run(() => api(`/admissions/rounds/${r.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa đợt tuyển sinh' : 'Tạo đợt tuyển sinh'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true, message: 'Nhập tên đợt' }]}>
            <Input placeholder="Tuyển sinh lớp 6 năm học 2027-2028" maxLength={200} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="gradeLevel" label="Khối tuyển" rules={[{ required: true }]}>
              <InputNumber min={1} max={12} style={{ width: 90 }} />
            </Form.Item>
            <Form.Item name="academicYearId" label="Năm học nhập học" rules={[{ required: true, message: 'Chọn năm học' }]}>
              <Select style={{ width: 160 }} options={years?.map((y) => ({ value: y.id, label: y.name }))} />
            </Form.Item>
            <Form.Item name="capacity" label="Chỉ tiêu">
              <InputNumber min={1} style={{ width: 110 }} placeholder="Không giới hạn" />
            </Form.Item>
          </Space>
          <Form.Item name="dates" label="Thời gian nhận hồ sơ" rules={[{ required: true, message: 'Chọn thời gian' }]}>
            <DatePicker.RangePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả / hướng dẫn cho phụ huynh">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

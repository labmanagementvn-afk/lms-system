'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, AutoComplete, Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';
import { useAllTeachers, useSubjects } from '@/lib/hooks';
import { GENDER, options, TEACHER_STATUS } from '@/lib/labels';

export default function TeachersPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: undefined as string | undefined, subjectId: undefined as string | undefined, subjectGroup: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/teachers', query]);
  const { data: subjects } = useSubjects();
  const { data: all, mutate: mutateAll } = useAllTeachers();
  // Tổ chuyên môn the school already uses, for the filter and to pick from when editing.
  const groups = useMemo(() => [...new Set((all?.items ?? []).map((t) => t.subjectGroup).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'vi')), [all]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const admin = canManage(me);

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : undefined,
        subjectIds: record.subjects.map((s: any) => s.subjectId),
      });
    }
  }

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({ ...values, dateOfBirth: values.dateOfBirth?.format('YYYY-MM-DD') });
    if (!body.password) delete body.password;
    // An emptied tổ chuyên môn is sent as null so it is cleared.
    body.subjectGroup = values.subjectGroup?.trim() || null;
    try {
      if (editing?.id) await api(`/teachers/${editing.id}`, { method: 'PATCH', body });
      else await api('/teachers', { method: 'POST', body });
      message.success('Đã lưu giáo viên');
      setEditing(null);
      mutate();
      mutateAll();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/teachers/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Quản lý giáo viên"
        extra={
          admin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
              Thêm giáo viên
            </Button>
          )
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên hoặc mã" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select placeholder="Trạng thái" allowClear options={options(TEACHER_STATUS)} style={{ width: 180 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Select
          placeholder="Môn dạy"
          allowClear
          options={subjects?.map((s) => ({ value: s.id, label: s.name }))}
          style={{ width: 200 }}
          onChange={(subjectId) => setQuery({ ...query, subjectId, page: 1 })}
        />
        <Select
          placeholder="Tổ chuyên môn"
          allowClear
          options={groups.map((g) => ({ value: g, label: g }))}
          style={{ width: 260 }}
          onChange={(subjectGroup) => setQuery({ ...query, subjectGroup, page: 1 })}
        />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1100 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã GV', dataIndex: 'code', width: 100 },
          { title: 'Họ và tên', dataIndex: 'fullName' },
          { title: 'Giới tính', dataIndex: 'gender', width: 90, render: (g) => GENDER[g] ?? '' },
          { title: 'Điện thoại', dataIndex: 'phone', width: 130 },
          { title: 'Tổ chuyên môn', dataIndex: 'subjectGroup', render: (g) => g ?? '' },
          { title: 'Môn dạy', render: (_, r) => r.subjects.map((s: any) => <Tag key={s.subjectId}>{s.subject.name}</Tag>) },
          { title: 'Chủ nhiệm', render: (_, r) => r.homeroomClasses.map((c: any) => c.name).join(', ') },
          { title: 'Tài khoản', render: (_, r) => (r.user ? r.user.email : <Tag>Chưa có</Tag>) },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 130,
            render: (s) => <Tag color={s === 'ACTIVE' ? 'green' : s === 'ON_LEAVE' ? 'orange' : 'default'}>{TEACHER_STATUS[s]}</Tag>,
          },
          ...(admin
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, r: any) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                      <Popconfirm title="Xóa giáo viên này?" onConfirm={() => remove(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing?.id ? 'Sửa giáo viên' : 'Thêm giáo viên'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space.Compact block>
            <Form.Item name="code" label="Mã giáo viên" rules={[{ required: true }]} style={{ width: '35%' }}>
              <Input />
            </Form.Item>
            <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true }]} style={{ width: '65%' }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space wrap>
            <Form.Item name="gender" label="Giới tính">
              <Select options={options(GENDER)} style={{ width: 120 }} allowClear />
            </Form.Item>
            <Form.Item name="dateOfBirth" label="Ngày sinh">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="phone" label="Điện thoại">
              <Input />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={options(TEACHER_STATUS)} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="subjectGroup" label="Tổ chuyên môn">
            <AutoComplete options={groups.map((g) => ({ value: g }))} placeholder="Tổ Toán - Khoa học tự nhiên" filterOption={(input, o) => !!o?.value.toLowerCase().includes(input.toLowerCase())} allowClear />
          </Form.Item>
          <Form.Item name="subjectIds" label="Môn dạy">
            <Select mode="multiple" options={subjects?.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing?.user ? 'Đặt lại mật khẩu đăng nhập' : 'Mật khẩu (để tạo tài khoản đăng nhập)'}
            rules={[{ min: 8, message: 'Tối thiểu 8 ký tự' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

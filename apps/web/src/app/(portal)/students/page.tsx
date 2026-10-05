'use client';

import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Divider, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canEditStudents, canManage, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { GENDER, options, RELATIONSHIP, STUDENT_STATUS } from '@/lib/labels';

export default function StudentsPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: undefined as string | undefined, classId: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/students', query]);
  const { data: classes } = useClasses();
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const editable = canEditStudents(me);
  const classOptions = classes?.map((c) => ({ value: c.id, label: c.name }));

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        dateOfBirth: record.dateOfBirth ? dayjs(record.dateOfBirth) : undefined,
        classId: record.enrollments[0]?.class.id,
        guardians: record.guardians.map((g: any) => ({ fullName: g.fullName, relationship: g.relationship, phone: g.phone, email: g.email ?? undefined, isPrimary: g.isPrimary })),
      });
    } else {
      form.setFieldsValue({ status: 'STUDYING', guardians: [{ relationship: 'MOTHER', isPrimary: true }] });
    }
  }

  async function save() {
    const values = await form.validateFields();
    const body: any = clean({
      ...values,
      dateOfBirth: values.dateOfBirth?.format('YYYY-MM-DD'),
      guardians: (values.guardians ?? []).map((g: any) => clean(g)),
    });
    try {
      if (editing?.id) await api(`/students/${editing.id}`, { method: 'PATCH', body });
      else await api('/students', { method: 'POST', body });
      message.success('Đã lưu học sinh');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/students/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Quản lý học sinh"
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
              Thêm học sinh
            </Button>
          )
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên hoặc mã" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select placeholder="Lớp" allowClear options={classOptions} style={{ width: 140 }} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
        <Select placeholder="Trạng thái" allowClear options={options(STUDENT_STATUS)} style={{ width: 180 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã HS', dataIndex: 'code', width: 120 },
          { title: 'Họ và tên', dataIndex: 'fullName' },
          { title: 'Ngày sinh', dataIndex: 'dateOfBirth', width: 110, render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '') },
          { title: 'Giới tính', dataIndex: 'gender', width: 90, render: (g) => GENDER[g] ?? '' },
          { title: 'Lớp', width: 80, render: (_, r) => r.enrollments[0]?.class.name },
          {
            title: 'Phụ huynh',
            render: (_, r) => {
              const g = r.guardians[0];
              return g ? `${g.fullName} (${RELATIONSHIP[g.relationship]}) · ${g.phone}` : '';
            },
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 130,
            render: (s) => <Tag color={s === 'STUDYING' ? 'green' : 'default'}>{STUDENT_STATUS[s]}</Tag>,
          },
          ...(editable
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, r: any) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                      {canManage(me) && (
                        <Popconfirm title="Xóa học sinh và toàn bộ dữ liệu điểm danh?" onConfirm={() => remove(r.id)}>
                          <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing?.id ? 'Sửa học sinh' : 'Thêm học sinh'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" width={720} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space.Compact block>
            <Form.Item name="code" label="Mã học sinh" rules={[{ required: true }]} style={{ width: '35%' }}>
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
            <Form.Item name="classId" label="Lớp">
              <Select options={classOptions} style={{ width: 140 }} allowClear />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={options(STUDENT_STATUS)} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <Divider orientation="left" plain>
            Phụ huynh / người giám hộ
          </Divider>
          <Form.List name="guardians">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} wrap align="baseline">
                    <Form.Item name={[name, 'fullName']} rules={[{ required: true, message: 'Nhập họ tên' }]}>
                      <Input placeholder="Họ và tên" />
                    </Form.Item>
                    <Form.Item name={[name, 'relationship']} rules={[{ required: true }]}>
                      <Select options={options(RELATIONSHIP)} style={{ width: 150 }} placeholder="Quan hệ" />
                    </Form.Item>
                    <Form.Item name={[name, 'phone']} rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
                      <Input placeholder="Điện thoại" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name={[name, 'isPrimary']} valuePropName="checked">
                      <Checkbox>Liên hệ chính</Checkbox>
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} aria-label="Bỏ" />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ relationship: 'FATHER' })} icon={<PlusOutlined />}>
                  Thêm phụ huynh
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

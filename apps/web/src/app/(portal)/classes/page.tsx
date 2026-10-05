'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api, clean } from '@/lib/api';
import { canEditStudents, canManage, useAuth } from '@/lib/auth';
import { useAcademicYears, useAllTeachers, useClasses } from '@/lib/hooks';
import { GENDER } from '@/lib/labels';

export default function ClassesPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data: years } = useAcademicYears();
  const [yearId, setYearId] = useState<string | undefined>();
  const { data: classes, isLoading, mutate } = useClasses(yearId);
  const { data: teachers } = useAllTeachers();
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const admin = canManage(me);

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    if (record) form.setFieldsValue({ name: record.name, gradeLevel: record.gradeLevel, homeroomTeacherId: record.homeroomTeacherId, room: record.room });
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing?.id) await api(`/classes/${editing.id}`, { method: 'PATCH', body: { ...values, homeroomTeacherId: values.homeroomTeacherId ?? null } });
      else await api('/classes', { method: 'POST', body: clean({ ...values, academicYearId: yearId }) });
      message.success('Đã lưu lớp học');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/classes/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Quản lý lớp học"
        extra={
          <Space wrap>
            <Select
              placeholder="Năm học hiện tại"
              allowClear
              style={{ width: 180 }}
              options={years?.map((y) => ({ value: y.id, label: `Năm học ${y.name}` }))}
              onChange={setYearId}
            />
            {admin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
                Thêm lớp
              </Button>
            )}
          </Space>
        }
      />
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={classes}
        pagination={false}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Lớp', dataIndex: 'name', width: 100 },
          { title: 'Khối', dataIndex: 'gradeLevel', width: 80 },
          { title: 'Giáo viên chủ nhiệm', render: (_, r) => r.homeroomTeacher?.fullName ?? '' },
          { title: 'Phòng học', dataIndex: 'room', width: 110 },
          { title: 'Sĩ số', width: 80, render: (_, r) => r._count.enrollments },
          {
            title: '',
            width: 150,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<TeamOutlined />} onClick={() => setViewing(r)}>
                  Học sinh
                </Button>
                {admin && <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />}
                {admin && (
                  <Popconfirm title="Xóa lớp này? Học sinh sẽ không còn thuộc lớp." onConfirm={() => remove(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing?.id ? 'Sửa lớp' : 'Thêm lớp'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="name" label="Tên lớp" rules={[{ required: true }]}>
              <Input placeholder="6A1" />
            </Form.Item>
            <Form.Item name="gradeLevel" label="Khối" rules={[{ required: true }]}>
              <InputNumber min={1} max={12} />
            </Form.Item>
            <Form.Item name="room" label="Phòng học">
              <Input placeholder="P.101" />
            </Form.Item>
          </Space>
          <Form.Item name="homeroomTeacherId" label="Giáo viên chủ nhiệm">
            <Select allowClear showSearch optionFilterProp="label" options={teachers?.items.map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})` }))} />
          </Form.Item>
        </Form>
      </Modal>
      <ClassStudentsDrawer klass={viewing} onClose={() => setViewing(null)} onChanged={() => mutate()} editable={canEditStudents(me)} />
    </>
  );
}

function ClassStudentsDrawer({ klass, onClose, onChanged, editable }: { klass: any; onClose: () => void; onChanged: () => void; editable: boolean }) {
  const { message } = App.useApp();
  const { data: students, mutate } = useSWR<any[]>(klass ? [`/classes/${klass.id}/students`] : null);
  const [search, setSearch] = useState('');
  const { data: found } = useSWR<any>(klass && search ? ['/students', { q: search, pageSize: 20, status: 'STUDYING' }] : null);
  const [selected, setSelected] = useState<string[]>([]);

  async function enroll() {
    try {
      await api(`/classes/${klass.id}/students`, { method: 'POST', body: { studentIds: selected } });
      setSelected([]);
      mutate();
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function unenroll(studentId: string) {
    await api(`/classes/${klass.id}/students/${studentId}`, { method: 'DELETE' });
    mutate();
    onChanged();
  }

  return (
    <Drawer title={klass ? `Học sinh lớp ${klass.name}` : ''} open={!!klass} onClose={onClose} width={640}>
      {editable && (
        <Space.Compact block style={{ marginBottom: 12 }}>
          <Select
            mode="multiple"
            showSearch
            filterOption={false}
            onSearch={setSearch}
            value={selected}
            onChange={setSelected}
            placeholder="Tìm học sinh để thêm vào lớp"
            style={{ width: '100%' }}
            options={found?.items.map((s: any) => ({ value: s.id, label: `${s.fullName} (${s.code})${s.enrollments[0] ? ` - ${s.enrollments[0].class.name}` : ''}` }))}
          />
          <Button type="primary" disabled={!selected.length} onClick={enroll}>
            Thêm
          </Button>
        </Space.Compact>
      )}
      <Table<any>
        rowKey="id"
        size="small"
        dataSource={students}
        pagination={false}
        columns={[
          { title: '#', width: 50, render: (_, __, i) => i + 1 },
          { title: 'Mã HS', dataIndex: 'code' },
          { title: 'Họ và tên', dataIndex: 'fullName' },
          { title: 'Giới tính', dataIndex: 'gender', render: (g) => GENDER[g] ?? '' },
          ...(editable
            ? [
                {
                  title: '',
                  width: 60,
                  render: (_: unknown, r: any) => (
                    <Popconfirm title="Xóa khỏi lớp?" onConfirm={() => unenroll(r.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa khỏi lớp" />
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Drawer>
  );
}

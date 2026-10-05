'use client';

import { EditOutlined, EyeOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE } from '@/lib/labels';
import { EmployeeDrawer } from './EmployeeDrawer';
import { EmployeeModal } from './EmployeeModal';
import { EmployeeStatusTag, fmtDate } from './shared';

const statusOptions = Object.entries(EMPLOYEE_STATUS).map(([value, s]) => ({ value, label: s.label }));

export function EmployeesTab({ departments, onChanged }: { departments?: string[]; onChanged?: () => void }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', department: undefined as string | undefined, status: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/hr/employees', query]);
  const [editing, setEditing] = useState<any | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function changed() {
    mutate();
    onChanged?.();
  }

  async function fromTeachers() {
    setImporting(true);
    try {
      const res = await api<{ created: number }>('/hr/employees/from-teachers', { method: 'POST' });
      message.success(res.created ? `Đã tạo ${res.created} hồ sơ từ danh sách giáo viên` : 'Mọi giáo viên đã có hồ sơ nhân sự');
      changed();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên, mã, email, điện thoại" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 280 }} />
        <Select
          placeholder="Bộ phận"
          allowClear
          showSearch
          style={{ width: 180 }}
          options={departments?.map((d) => ({ value: d, label: d }))}
          onChange={(department) => setQuery({ ...query, department, page: 1 })}
        />
        <Select placeholder="Trạng thái" allowClear options={statusOptions} style={{ width: 160 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
          Thêm nhân viên
        </Button>
        <Popconfirm title="Tạo hồ sơ nhân sự cho mọi giáo viên chưa có?" onConfirm={fromTeachers} okText="Tạo" cancelText="Hủy">
          <Button icon={<TeamOutlined />} loading={importing}>
            Tạo từ danh sách giáo viên
          </Button>
        </Popconfirm>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 90 },
          {
            title: 'Họ và tên',
            dataIndex: 'fullName',
            render: (name, r) => (
              <>
                {name} {r.teacher && <Tag color="blue">GV</Tag>}
              </>
            ),
          },
          { title: 'Bộ phận', dataIndex: 'department', width: 140 },
          { title: 'Chức vụ', dataIndex: 'position', width: 140 },
          { title: 'Hình thức', dataIndex: 'employmentType', width: 130, render: (t) => EMPLOYMENT_TYPE[t] },
          { title: 'Điện thoại', dataIndex: 'phone', width: 120 },
          { title: 'Email', dataIndex: 'email', width: 200 },
          { title: 'Vào làm', dataIndex: 'hireDate', width: 100, render: fmtDate },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (s) => <EmployeeStatusTag status={s} /> },
          {
            title: '',
            width: 90,
            render: (_, r) => (
              <Space onClick={(ev) => ev.stopPropagation()}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenId(r.id)} aria-label="Xem hồ sơ" />
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Sửa" />
              </Space>
            ),
          },
        ]}
      />
      <EmployeeModal record={editing} onClose={() => setEditing(null)} onSaved={changed} />
      <EmployeeDrawer employeeId={openId} onClose={() => setOpenId(null)} onChanged={changed} />
    </>
  );
}

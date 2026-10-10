'use client';

import { DeleteOutlined, EditOutlined, ExportOutlined, LoginOutlined, PlusOutlined, StopOutlined, SwapOutlined, TrophyOutlined, WarningOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { PickedStudent, RecordAction, RecordActionModal } from '@/components/students/RecordActionModal';
import { StudentFormModal } from '@/components/students/StudentFormModal';
import { api } from '@/lib/api';
import { canEditStudents, canManage, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { GENDER, options, POLICY_GROUP, RELATIONSHIP, STUDENT_STATUS } from '@/lib/labels';

const picked = (r: any): PickedStudent => ({ id: r.id, fullName: r.fullName, className: r.enrollments[0]?.class.name, gradeLevel: r.enrollments[0]?.class.gradeLevel });

export default function StudentsPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: undefined as string | undefined, classId: undefined as string | undefined, policyGroup: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/students', query]);
  const { data: classes } = useClasses();
  const [editing, setEditing] = useState<any | null>(null);
  const [selected, setSelected] = useState<any[]>([]);
  const [action, setAction] = useState<{ kind: RecordAction; students: PickedStudent[] } | null>(null);
  const editable = canEditStudents(me);
  const classOptions = classes?.map((c) => ({ value: c.id, label: c.name }));

  async function remove(id: string) {
    try {
      await api(`/students/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const act = (kind: RecordAction, students = selected.map(picked)) => setAction({ kind, students });
  const done = () => {
    setAction(null);
    setSelected([]);
    mutate();
  };

  return (
    <>
      <PageHeader
        title="Hồ sơ học sinh"
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
              Thêm học sinh
            </Button>
          )
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên hoặc mã" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 260 }} />
        <Select placeholder="Lớp" allowClear showSearch optionFilterProp="label" options={classOptions} style={{ width: 140 }} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
        <Select placeholder="Tình trạng" allowClear options={options(STUDENT_STATUS)} style={{ width: 160 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Select placeholder="Diện chính sách" allowClear options={options(POLICY_GROUP)} style={{ width: 220 }} onChange={(policyGroup) => setQuery({ ...query, policyGroup, page: 1 })} />
      </Space>
      {selected.length > 0 && (
        <Space wrap style={{ marginBottom: 12, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, width: '100%' }}>
          <Typography.Text strong>Đã chọn {selected.length} học sinh</Typography.Text>
          {editable && (
            <>
              <Button size="small" icon={<SwapOutlined />} onClick={() => act('move')}>
                Chuyển lớp
              </Button>
              <Button size="small" icon={<ExportOutlined />} onClick={() => act('transfer')}>
                Chuyển trường
              </Button>
              <Button size="small" icon={<StopOutlined />} onClick={() => act('drop')}>
                Thôi học
              </Button>
            </>
          )}
          <Button size="small" icon={<TrophyOutlined />} onClick={() => act('award')}>
            Khen thưởng
          </Button>
          <Button size="small" icon={<WarningOutlined />} onClick={() => act('discipline')}>
            Kỷ luật
          </Button>
          <Button size="small" type="link" onClick={() => setSelected([])}>
            Bỏ chọn
          </Button>
        </Space>
      )}
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 980 }}
        rowSelection={{
          selectedRowKeys: selected.map((s) => s.id),
          preserveSelectedRowKeys: true,
          onChange: (_, rows) => setSelected(rows.filter(Boolean)),
          getCheckboxProps: (r) => ({ disabled: r.status !== 'STUDYING' }),
        }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã HS', dataIndex: 'code', width: 130 },
          { title: 'Họ và tên', dataIndex: 'fullName', render: (name, r) => <Link href={`/students/${r.id}`}>{name}</Link> },
          { title: 'Ngày sinh', dataIndex: 'dateOfBirth', width: 110, render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '') },
          { title: 'Giới tính', dataIndex: 'gender', width: 80, render: (g) => GENDER[g] ?? '' },
          { title: 'Lớp', width: 70, render: (_, r) => r.enrollments[0]?.class.name },
          {
            title: 'Phụ huynh',
            render: (_, r) => {
              const g = r.guardians[0];
              return g ? `${g.fullName} (${RELATIONSHIP[g.relationship]}) · ${g.phone}` : '';
            },
          },
          {
            title: 'Tình trạng',
            dataIndex: 'status',
            width: 150,
            render: (s, r) => (
              <Space size={4} wrap>
                <Tag color={s === 'STUDYING' ? 'green' : s === 'GRADUATED' ? 'blue' : 'orange'}>{STUDENT_STATUS[s]}</Tag>
                {r.policyGroups?.length > 0 && (
                  <Tooltip title={r.policyGroups.map((p: string) => POLICY_GROUP[p]).join(', ')}>
                    <Tag color="purple">Chính sách</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
          ...(editable
            ? [
                {
                  title: '',
                  width: 110,
                  render: (_: unknown, r: any) => (
                    <Space>
                      <Tooltip title="Sửa hồ sơ">
                        <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Sửa" />
                      </Tooltip>
                      {(r.status === 'TRANSFERRED' || r.status === 'DROPPED') && (
                        <Tooltip title="Tiếp nhận trở lại">
                          <Button size="small" icon={<LoginOutlined />} onClick={() => act('readmit', [picked(r)])} aria-label="Tiếp nhận trở lại" />
                        </Tooltip>
                      )}
                      {canManage(me) && (
                        <Popconfirm title="Xóa học sinh và toàn bộ dữ liệu liên quan?" onConfirm={() => remove(r.id)}>
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
      <StudentFormModal
        student={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />
      <RecordActionModal action={action?.kind ?? null} students={action?.students ?? []} onClose={() => setAction(null)} onDone={done} />
    </>
  );
}

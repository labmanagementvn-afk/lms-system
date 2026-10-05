'use client';

import { KeyOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useClasses } from '@/lib/hooks';
import { RELATIONSHIP } from '@/lib/labels';

interface Account {
  id: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  children: { id: string; code: string; fullName: string; relationship: string; isPrimary: boolean; class: { name: string } | null }[];
}

interface Pending {
  phone: string;
  fullName: string;
  guardianIds: string[];
  students: { id: string; code: string; fullName: string }[];
}

interface Created {
  fullName: string;
  phone: string;
  password: string | null;
  linked: boolean;
  students: string[];
}

export default function ParentsPage() {
  return (
    <>
      <PageHeader title="Tài khoản phụ huynh" />
      <Tabs
        items={[
          { key: 'accounts', label: 'Đã có tài khoản', children: <Accounts /> },
          { key: 'pending', label: 'Chưa có tài khoản', children: <PendingList /> },
        ]}
      />
    </>
  );
}

/** Shows first-time passwords once; staff hand them to parents and the app forces a change at first login. */
function PasswordResults({ rows, onClose }: { rows: Created[]; onClose: () => void }) {
  const csv = ['Họ tên,Số điện thoại,Mật khẩu,Học sinh', ...rows.map((r) => `"${r.fullName}",${r.phone},${r.password ?? '(đã có)'},"${r.students.join(' ')}"`)].join('\n');
  function download() {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tai-khoan-phu-huynh.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <Modal open title="Mật khẩu lần đầu" onCancel={onClose} onOk={onClose} width={720} footer={<Space><Button onClick={download}>Tải CSV</Button><Button type="primary" onClick={onClose}>Đóng</Button></Space>}>
      <Alert type="warning" showIcon message="Mật khẩu chỉ hiển thị một lần. Phụ huynh sẽ phải đổi mật khẩu khi đăng nhập lần đầu." style={{ marginBottom: 12 }} />
      <Table<Created>
        size="small"
        rowKey="phone"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: 'Phụ huynh', dataIndex: 'fullName' },
          { title: 'Số điện thoại', dataIndex: 'phone' },
          { title: 'Mật khẩu', dataIndex: 'password', render: (v: string | null, r) => (v ? <Typography.Text code copyable>{v}</Typography.Text> : <Tag>{r.linked ? 'Gắn vào tài khoản sẵn có' : '—'}</Tag>) },
          { title: 'Học sinh', dataIndex: 'students', render: (s: string[]) => s.join(', ') },
        ]}
      />
    </Modal>
  );
}

function Accounts() {
  const { message } = App.useApp();
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState<string>();
  const [page, setPage] = useState(1);
  const { data: classes } = useClasses();
  const { data, isLoading, mutate } = useSWR<{ items: Account[]; total: number }>(['/parents/accounts', { q, classId, page, pageSize: 20 }]);
  const [result, setResult] = useState<Created[] | null>(null);

  async function reset(a: Account) {
    const res = await api<{ password: string }>(`/parents/accounts/${a.id}/reset-password`, { method: 'POST' });
    setResult([{ fullName: a.fullName, phone: a.phone ?? '', password: res.password, linked: false, students: a.children.map((c) => c.code) }]);
  }

  async function toggle(a: Account, isActive: boolean) {
    try {
      await api(`/parents/accounts/${a.id}`, { method: 'PATCH', body: { isActive } });
      message.success(isActive ? 'Đã mở lại tài khoản' : 'Đã khóa tài khoản');
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Tìm theo tên, số điện thoại, học sinh" allowClear onSearch={(v) => { setQ(v); setPage(1); }} style={{ width: 320 }} />
        <Select allowClear placeholder="Lớp" style={{ width: 160 }} value={classId} onChange={(v) => { setClassId(v); setPage(1); }} options={classes?.map((c: any) => ({ value: c.id, label: c.name }))} />
      </Space>
      <Table<Account>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Phụ huynh', dataIndex: 'fullName' },
          { title: 'Số điện thoại', dataIndex: 'phone' },
          {
            title: 'Học sinh',
            dataIndex: 'children',
            render: (kids: Account['children']) => kids.map((k) => (
              <Tag key={k.id}>
                {k.fullName}{k.class ? ` (${k.class.name})` : ''} · {RELATIONSHIP[k.relationship] ?? k.relationship}
              </Tag>
            )),
          },
          { title: 'Trạng thái', dataIndex: 'mustChangePassword', render: (v: boolean, a) => (!a.isActive ? <Tag>Đã khóa</Tag> : v ? <Tag color="orange">Chưa đổi mật khẩu</Tag> : <Tag color="green">Đang dùng</Tag>) },
          {
            title: '',
            render: (_, a) => (
              <Space>
                <Popconfirm title="Cấp mật khẩu mới cho phụ huynh này?" onConfirm={() => reset(a)}>
                  <Button size="small" icon={<KeyOutlined />}>Cấp lại mật khẩu</Button>
                </Popconfirm>
                <Switch size="small" checked={a.isActive} onChange={(v) => toggle(a, v)} checkedChildren="Mở" unCheckedChildren="Khóa" />
              </Space>
            ),
          },
        ]}
      />
      {result && <PasswordResults rows={result} onClose={() => setResult(null)} />}
    </>
  );
}

function PendingList() {
  const { message } = App.useApp();
  const [classId, setClassId] = useState<string>();
  const { data: classes } = useClasses();
  const { data, isLoading, mutate } = useSWR<{ items: Pending[]; invalid: { guardianId: string; fullName: string; phone: string; student: string }[] }>(['/parents/accounts/pending', { classId }]);
  const [result, setResult] = useState<Created[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function createOne(p: Pending) {
    try {
      const res = await api<{ password: string | null; linked: boolean }>('/parents/accounts', { method: 'POST', body: { guardianId: p.guardianIds[0] } });
      setResult([{ fullName: p.fullName, phone: p.phone, password: res.password, linked: res.linked, students: p.students.map((s) => s.code) }]);
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function createAll() {
    setCreating(true);
    try {
      const res = await api<{ created: Created[] }>('/parents/accounts/bulk', { method: 'POST', body: { classId } });
      if (!res.created.length) message.info('Không có phụ huynh nào cần tạo tài khoản');
      else setResult(res.created);
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select allowClear placeholder="Tất cả các lớp" style={{ width: 180 }} value={classId} onChange={setClassId} options={classes?.map((c: any) => ({ value: c.id, label: c.name }))} />
        <Popconfirm title={`Tạo tài khoản cho ${data?.items.length ?? 0} phụ huynh${classId ? ' của lớp này' : ''}?`} onConfirm={createAll}>
          <Button type="primary" icon={<UsergroupAddOutlined />} loading={creating} disabled={!data?.items.length}>
            Tạo hàng loạt
          </Button>
        </Popconfirm>
        <Typography.Text type="secondary">Mỗi số điện thoại là một tài khoản; anh chị em dùng chung tài khoản của cha mẹ.</Typography.Text>
      </Space>
      {!!data?.invalid.length && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${data.invalid.length} phụ huynh có số điện thoại không hợp lệ (sửa trong hồ sơ học sinh): ${data.invalid.slice(0, 5).map((i) => `${i.fullName} (${i.phone}, HS ${i.student})`).join('; ')}${data.invalid.length > 5 ? '…' : ''}`} />
      )}
      <Table<Pending>
        rowKey="phone"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          { title: 'Phụ huynh', dataIndex: 'fullName' },
          { title: 'Số điện thoại', dataIndex: 'phone' },
          { title: 'Học sinh', dataIndex: 'students', render: (s: Pending['students']) => s.map((x) => `${x.code} ${x.fullName}`).join(', ') },
          { title: '', render: (_, p) => <Button size="small" onClick={() => createOne(p)}>Tạo tài khoản</Button> },
        ]}
      />
      {result && <PasswordResults rows={result} onClose={() => setResult(null)} />}
    </>
  );
}

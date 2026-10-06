'use client';

import { KeyOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useClasses } from '@/lib/hooks';

interface Row {
  id: string;
  code: string;
  fullName: string;
  status: string;
  class: { id: string; name: string } | null;
  account: { id: string; username: string | null; isActive: boolean; mustChangePassword: boolean; createdAt: string } | null;
}

interface Created {
  code: string;
  fullName: string;
  username: string;
  password: string;
  class: string | null;
}

export default function StudentAccountsPage() {
  return (
    <>
      <PageHeader title="Tài khoản học sinh" />
      <Typography.Paragraph type="secondary">
        Học sinh đăng nhập ứng dụng học tập bằng mã học sinh và mật khẩu do nhà trường cấp; lần đầu đăng nhập phải đổi mật khẩu.
      </Typography.Paragraph>
      <Tabs
        items={[
          { key: 'accounts', label: 'Đã có tài khoản', children: <Accounts /> },
          { key: 'pending', label: 'Chưa có tài khoản', children: <PendingList /> },
        ]}
      />
    </>
  );
}

/** First-time passwords, shown once; staff print or export them for the homeroom teacher. */
function PasswordResults({ rows, onClose }: { rows: Created[]; onClose: () => void }) {
  const csv = ['Mã HS,Họ tên,Lớp,Tên đăng nhập,Mật khẩu', ...rows.map((r) => `${r.code},"${r.fullName}",${r.class ?? ''},${r.username},${r.password}`)].join('\n');
  function download() {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tai-khoan-hoc-sinh.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <Modal
      open
      title="Mật khẩu lần đầu"
      onCancel={onClose}
      onOk={onClose}
      width={720}
      footer={
        <Space>
          <Button onClick={download}>Tải CSV</Button>
          <Button type="primary" onClick={onClose}>
            Đóng
          </Button>
        </Space>
      }
    >
      <Alert type="warning" showIcon message="Mật khẩu chỉ hiển thị một lần. Học sinh sẽ phải đổi mật khẩu khi đăng nhập lần đầu." style={{ marginBottom: 12 }} />
      <Table<Created>
        size="small"
        rowKey="code"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: 'Mã HS', dataIndex: 'code' },
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Lớp', dataIndex: 'class' },
          { title: 'Tên đăng nhập', dataIndex: 'username', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: 'Mật khẩu', dataIndex: 'password', render: (v: string) => <Typography.Text code copyable>{v}</Typography.Text> },
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
  const { data, isLoading, mutate } = useSWR<{ items: Row[]; total: number }>(['/students/accounts', { q, classId, page, pageSize: 20 }]);
  const [result, setResult] = useState<Created[] | null>(null);

  async function reset(r: Row) {
    const res = await api<{ password: string }>(`/students/accounts/${r.account!.id}/reset-password`, { method: 'POST' });
    setResult([{ code: r.code, fullName: r.fullName, class: r.class?.name ?? null, username: r.account!.username ?? '', password: res.password }]);
  }

  async function toggle(r: Row, isActive: boolean) {
    try {
      await api(`/students/accounts/${r.account!.id}`, { method: 'PATCH', body: { isActive } });
      message.success(isActive ? 'Đã mở lại tài khoản' : 'Đã khóa tài khoản');
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="Tìm theo tên hoặc mã học sinh"
          allowClear
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          style={{ width: 300 }}
        />
        <Select
          allowClear
          placeholder="Lớp"
          style={{ width: 160 }}
          value={classId}
          onChange={(v) => {
            setClassId(v);
            setPage(1);
          }}
          options={classes?.map((c: any) => ({ value: c.id, label: c.name }))}
        />
      </Space>
      <Table<Row>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Mã HS', dataIndex: 'code' },
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Lớp', dataIndex: 'class', render: (c: Row['class']) => c?.name ?? '—' },
          { title: 'Tên đăng nhập', dataIndex: ['account', 'username'], render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          {
            title: 'Trạng thái',
            render: (_, r) =>
              !r.account!.isActive ? <Tag>Đã khóa</Tag> : r.account!.mustChangePassword ? <Tag color="orange">Chưa đổi mật khẩu</Tag> : <Tag color="green">Đang dùng</Tag>,
          },
          {
            title: '',
            render: (_, r) => (
              <Space>
                <Popconfirm title="Cấp mật khẩu mới cho học sinh này?" onConfirm={() => reset(r)}>
                  <Button size="small" icon={<KeyOutlined />}>
                    Cấp lại mật khẩu
                  </Button>
                </Popconfirm>
                <Switch size="small" checked={r.account!.isActive} onChange={(v) => toggle(r, v)} checkedChildren="Mở" unCheckedChildren="Khóa" />
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
  const { data, isLoading, mutate } = useSWR<{ items: Row[] }>(['/students/accounts/pending', { classId }]);
  const [result, setResult] = useState<Created[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function createOne(r: Row) {
    try {
      const res = await api<{ student: Row; password: string }>('/students/accounts', { method: 'POST', body: { studentId: r.id } });
      setResult([{ code: r.code, fullName: r.fullName, class: r.class?.name ?? null, username: res.student.account?.username ?? '', password: res.password }]);
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function createAll() {
    setCreating(true);
    try {
      const res = await api<{ created: Created[] }>('/students/accounts/bulk', { method: 'POST', body: { classId } });
      if (!res.created.length) message.info('Không có học sinh nào cần tạo tài khoản');
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
        <Popconfirm title={`Tạo tài khoản cho ${data?.items.length ?? 0} học sinh${classId ? ' của lớp này' : ''}?`} onConfirm={createAll}>
          <Button type="primary" icon={<UsergroupAddOutlined />} loading={creating} disabled={!data?.items.length}>
            Tạo hàng loạt
          </Button>
        </Popconfirm>
      </Space>
      <Table<Row>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          { title: 'Mã HS', dataIndex: 'code' },
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Lớp', dataIndex: 'class', render: (c: Row['class']) => c?.name ?? '—' },
          { title: '', render: (_, r) => <Button size="small" onClick={() => createOne(r)}>Tạo tài khoản</Button> },
        ]}
      />
      {result && <PasswordResults rows={result} onClose={() => setResult(null)} />}
    </>
  );
}

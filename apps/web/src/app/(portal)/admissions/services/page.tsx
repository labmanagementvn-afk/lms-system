'use client';

import { CheckOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Drawer, Form, Input, Popconfirm, Result, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formToBody, registrationToForm, ServiceRegistrationForm } from '@/components/admissions/ServiceRegistrationForm';
import { downloadCsv, uniformText } from '@/components/admissions/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { REGISTRATION_STATUS } from '@/lib/labels';

const STATUS_FILTER = [
  { value: 'SUBMITTED', label: 'Đã gửi' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'NONE', label: 'Chưa đăng ký' },
];

export default function ServicesPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', classId: undefined as string | undefined, status: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/admissions/services', query]);
  const { data: summary, mutate: mutateSummary } = useSWR<any>(['/admissions/services/summary', { classId: query.classId }]);
  const [editing, setEditing] = useState<any | null>(null);
  const refresh = () => {
    mutate();
    mutateSummary();
  };

  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Đăng ký dịch vụ chỉ dành cho văn phòng nhà trường." />;
  }

  async function confirm(id: string) {
    try {
      await api(`/admissions/services/${id}/confirm`, { method: 'POST' });
      message.success('Đã xác nhận đăng ký');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function exportCsv() {
    try {
      await downloadCsv('/admissions/services/export', { classId: query.classId }, 'dang-ky-dich-vu.csv');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const sizes = summary ? Object.entries(summary.uniform.bySize as Record<string, number>).filter(([, n]) => n) : [];
  const extras = summary ? Object.entries(summary.extras as Record<string, number>) : [];

  return (
    <>
      <PageHeader
        title={`Đăng ký dịch vụ đầu năm${summary ? ` · ${summary.academicYear.name}` : ''}`}
        extra={
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            Xuất CSV
          </Button>
        }
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Đã đăng ký / học sinh" value={summary?.registered ?? 0} suffix={`/ ${summary?.students ?? 0}`} />
            <Typography.Text type="secondary">
              {summary?.submitted ?? 0} chờ xác nhận · {summary?.confirmed ?? 0} đã xác nhận
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Bán trú" value={summary?.canteen ?? 0} suffix="HS" />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Xe đưa đón" value={summary?.bus ?? 0} suffix="HS" />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={6}>
          <Card size="small">
            <Statistic title="Đồng phục" value={summary?.uniform.quantity ?? 0} suffix="bộ" />
            <Space size={4} wrap>
              {sizes.length ? sizes.map(([s, n]) => <Tag key={s}>{`Áo ${s}: ${n}`}</Tag>) : <Typography.Text type="secondary">Chưa có</Typography.Text>}
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card size="small" title="Dịch vụ khác" styles={{ body: { paddingTop: 8 } }}>
            <Space size={4} wrap>
              {extras.length ? extras.map(([name, n]) => <Tag key={name}>{`${name}: ${n}`}</Tag>) : <Typography.Text type="secondary">Chưa có</Typography.Text>}
            </Space>
          </Card>
        </Col>
      </Row>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder="Lớp" allowClear style={{ width: 140 }} options={classes?.map((c) => ({ value: c.id, label: c.name }))} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
        <Select placeholder="Trạng thái" allowClear style={{ width: 160 }} options={STATUS_FILTER} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Input.Search placeholder="Tìm theo tên hoặc mã HS" allowClear style={{ width: 240 }} onSearch={(q) => setQuery({ ...query, q, page: 1 })} />
      </Space>
      <Table<any>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã HS', width: 110, render: (_, r) => r.student.code },
          { title: 'Họ và tên', render: (_, r) => r.student.fullName },
          { title: 'Lớp', width: 70, render: (_, r) => r.student.class?.name },
          { title: 'Bán trú', width: 80, align: 'center', render: (_, r) => (r.registration?.canteen ? <CheckOutlined style={{ color: '#16a34a' }} /> : '') },
          {
            title: 'Xe đưa đón',
            width: 200,
            render: (_, r) =>
              r.registration?.bus ? (
                <>
                  <CheckOutlined style={{ color: '#16a34a' }} /> {r.registration.busStopNote}
                </>
              ) : (
                ''
              ),
          },
          { title: 'Đồng phục', width: 150, render: (_, r) => uniformText(r.registration?.uniform) },
          { title: 'Dịch vụ khác', render: (_, r) => (r.registration?.extras ?? []).map((e: string) => <Tag key={e}>{e}</Tag>) },
          { title: 'Ghi chú', ellipsis: true, render: (_, r) => r.registration?.note },
          {
            title: 'Trạng thái',
            width: 130,
            render: (_, r) =>
              r.registration ? <Tag color={REGISTRATION_STATUS[r.registration.status].color}>{REGISTRATION_STATUS[r.registration.status].label}</Tag> : <Tag>Chưa đăng ký</Tag>,
          },
          {
            title: '',
            width: 130,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Sửa" />
                {r.registration?.status === 'SUBMITTED' && (
                  <Popconfirm title="Xác nhận đăng ký? Phụ huynh sẽ không tự sửa được nữa." onConfirm={() => confirm(r.registration.id)}>
                    <Button size="small" type="primary" icon={<CheckOutlined />}>
                      Xác nhận
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <EditDrawer row={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

function EditDrawer({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) {
      form.resetFields();
      form.setFieldsValue(registrationToForm(row.registration));
    }
  }, [form, row]);

  async function save() {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await api(`/admissions/services/student/${row.student.id}`, { method: 'PUT', body: formToBody(values) });
      message.success('Đã lưu đăng ký');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      width={520}
      title={row ? `${row.student.code} · ${row.student.fullName}${row.student.class ? ` (${row.student.class.name})` : ''}` : ''}
      extra={
        <Button type="primary" onClick={save} loading={busy}>
          Lưu
        </Button>
      }
      forceRender
    >
      {row?.registration && (
        <Typography.Paragraph type="secondary">
          Trạng thái: <Tag color={REGISTRATION_STATUS[row.registration.status].color}>{REGISTRATION_STATUS[row.registration.status].label}</Tag> (sửa không đổi trạng thái)
        </Typography.Paragraph>
      )}
      <ServiceRegistrationForm form={form} />
    </Drawer>
  );
}

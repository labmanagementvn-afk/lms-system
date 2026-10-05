'use client';

import { ClockCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { AnnouncementDetail } from '@/components/announcements/AnnouncementDetail';
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm';
import { describeRoles, formatDateTime } from '@/components/announcements/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ANNOUNCEMENT_STATUS, NOTIFICATION_KIND } from '@/lib/labels';

const PAGE_SIZE = 20;

export default function AnnouncementsPage() {
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const [kind, setKind] = useState<string>();
  const { data, isLoading, mutate } = useSWR<any>(['/announcements', { page, pageSize: PAGE_SIZE, status, kind }]);
  const [form, setForm] = useState<{ open: boolean; initial: any | null }>({ open: false, initial: null });
  const [detailId, setDetailId] = useState<string | null>(null);

  async function act(fn: () => Promise<any>, ok: (r: any) => string) {
    try {
      const r = await fn();
      message.success(ok(r));
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function sendNow(a: any) {
    try {
      const p = await api(`/announcements/${a.id}/preview`, { method: 'POST' });
      modal.confirm({
        title: `Gửi "${a.title}" ngay?`,
        content: `Sẽ gửi tới ${p.recipients} người (${describeRoles(p.byRole)}).`,
        okText: 'Gửi',
        cancelText: 'Hủy',
        onOk: () => act(() => api(`/announcements/${a.id}/send`, { method: 'POST' }), (r) => `Đã gửi tới ${r.recipients} người`),
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Thông báo & sự kiện"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true, initial: null })}>
            Tạo thông báo
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="Tất cả trạng thái"
          allowClear
          style={{ width: 170 }}
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={Object.entries(ANNOUNCEMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))}
        />
        <Select
          placeholder="Tất cả loại"
          allowClear
          style={{ width: 140 }}
          value={kind}
          onChange={(v) => (setKind(v), setPage(1))}
          options={[
            { value: 'ANNOUNCEMENT', label: 'Thông báo' },
            { value: 'EVENT', label: 'Sự kiện' },
          ]}
        />
        {me?.role !== 'TEACHER' && (
          <Tooltip title="Hệ thống tự gửi thông báo hẹn giờ mỗi 30 giây; bấm để gửi ngay những thông báo đã đến giờ">
            <Button icon={<ClockCircleOutlined />} onClick={() => act(() => api('/announcements/run-scheduled', { method: 'POST' }), (r) => `Đã gửi ${r.sent} thông báo đến giờ`)}>
              Gửi thông báo đến giờ
            </Button>
          </Tooltip>
        )}
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1200 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: 'Tiêu đề',
            render: (_, a) => (
              <Typography.Link onClick={() => setDetailId(a.id)}>
                <b>{a.title}</b>
              </Typography.Link>
            ),
          },
          { title: 'Loại', width: 110, render: (_, a) => <Tag color={a.kind === 'EVENT' ? 'purple' : 'blue'}>{NOTIFICATION_KIND[a.kind]}</Tag> },
          { title: 'Trạng thái', width: 120, render: (_, a) => <Tag color={ANNOUNCEMENT_STATUS[a.status].color}>{ANNOUNCEMENT_STATUS[a.status].label}</Tag> },
          {
            title: 'Thời gian',
            width: 190,
            render: (_, a) =>
              a.status === 'SENT' ? `Gửi ${formatDateTime(a.sentAt, tz)}` : a.status === 'SCHEDULED' ? `Hẹn ${formatDateTime(a.scheduledAt, tz)}` : `Tạo ${formatDateTime(a.createdAt, tz)}`,
          },
          {
            title: 'Sự kiện',
            width: 180,
            render: (_, a) =>
              a.kind === 'EVENT' && a.eventAt ? (
                <>
                  {formatDateTime(a.eventAt, tz)}
                  {a.location && <div style={{ fontSize: 12, color: '#64748b' }}>{a.location}</div>}
                </>
              ) : (
                ''
              ),
          },
          { title: 'Người nhận', dataIndex: 'recipients', width: 100, align: 'right' },
          {
            title: 'Đã đọc',
            width: 150,
            render: (_, a) =>
              a.status === 'SENT' ? (
                <Progress size="small" percent={a.recipients ? Math.round((a.readCount / a.recipients) * 100) : 0} format={() => `${a.readCount}/${a.recipients}`} />
              ) : (
                ''
              ),
          },
          {
            title: 'Tham dự',
            width: 140,
            render: (_, a) =>
              a.rsvp && a.status === 'SENT' ? (
                <Space size={2}>
                  <Tooltip title="Tham dự">
                    <Tag color="green">{a.rsvpCounts.GOING}</Tag>
                  </Tooltip>
                  <Tooltip title="Không tham dự">
                    <Tag color="red">{a.rsvpCounts.NOT_GOING}</Tag>
                  </Tooltip>
                  <Tooltip title="Chưa chắc">
                    <Tag color="orange">{a.rsvpCounts.MAYBE}</Tag>
                  </Tooltip>
                </Space>
              ) : (
                ''
              ),
          },
          {
            title: '',
            width: 130,
            render: (_, a) =>
              a.status !== 'SENT' && (
                <Space>
                  <Tooltip title="Gửi ngay">
                    <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => sendNow(a)} aria-label="Gửi ngay" />
                  </Tooltip>
                  <Button size="small" icon={<EditOutlined />} onClick={() => setForm({ open: true, initial: a })} aria-label="Sửa" />
                  <Popconfirm title="Xóa thông báo này?" okText="Xóa" cancelText="Hủy" onConfirm={() => act(() => api(`/announcements/${a.id}`, { method: 'DELETE' }), () => 'Đã xóa')}>
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                </Space>
              ),
          },
        ]}
      />
      <AnnouncementForm open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} onSaved={() => mutate()} />
      <AnnouncementDetail id={detailId} onClose={() => setDetailId(null)} onChanged={() => mutate()} />
    </>
  );
}

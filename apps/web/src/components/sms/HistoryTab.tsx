'use client';

import { CloseCircleOutlined, RedoOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { formatDateTime } from '@/components/announcements/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SMS_AUDIENCE, SMS_CAMPAIGN_STATUS, SMS_STATUS } from '@/lib/labels';

const PAGE_SIZE = 20;

/** Đã gửi: every text sent or scheduled, with how its messages went; scheduled ones can be called off, failed ones sent again. */
export function HistoryTab() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const office = me?.role !== 'TEACHER';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const [audience, setAudience] = useState<string>();
  const [q, setQ] = useState('');
  const { data, isLoading, mutate } = useSWR<any>(['/sms/campaigns', { page, pageSize: PAGE_SIZE, status, audience, q }], { refreshInterval: (d) => (d?.items?.some((c: any) => c.status === 'SENDING') ? 5000 : 0) });
  const [openId, setOpenId] = useState<string | null>(null);

  async function act(fn: () => Promise<any>, ok: (r: any) => string) {
    try {
      message.success(ok(await fn()));
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tiêu đề" allowClear style={{ width: 240 }} onSearch={(v) => (setQ(v), setPage(1))} />
        <Select
          placeholder="Tất cả trạng thái"
          allowClear
          style={{ width: 160 }}
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={Object.entries(SMS_CAMPAIGN_STATUS).map(([value, s]) => ({ value, label: s.label }))}
        />
        {office && (
          <Select
            placeholder="Mọi đối tượng"
            allowClear
            style={{ width: 150 }}
            value={audience}
            onChange={(v) => (setAudience(v), setPage(1))}
            options={Object.entries(SMS_AUDIENCE).map(([value, label]) => ({ value, label }))}
          />
        )}
        {office && (
          <Tooltip title="Hệ thống tự gửi tin đến giờ mỗi 15 giây; bấm để gửi ngay">
            <Button icon={<ThunderboltOutlined />} onClick={() => act(() => api('/sms/dispatch', { method: 'POST' }), (r) => `Đã gửi ${r.sent} tin, lỗi ${r.failed} tin`)}>
              Gửi tin đến giờ
            </Button>
          </Tooltip>
        )}
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1100 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: 'Tiêu đề',
            render: (_, c) => (
              <>
                <Typography.Link onClick={() => setOpenId(c.id)}>
                  <b>{c.title}</b>
                </Typography.Link>
                <div style={{ fontSize: 12, color: '#64748b' }}>{c.label}</div>
              </>
            ),
          },
          { title: 'Trạng thái', width: 110, render: (_, c) => <Tag color={SMS_CAMPAIGN_STATUS[c.status].color}>{SMS_CAMPAIGN_STATUS[c.status].label}</Tag> },
          { title: 'Thời gian gửi', width: 150, render: (_, c) => formatDateTime(c.scheduledAt, tz) },
          { title: 'Người gửi', width: 150, dataIndex: 'createdBy' },
          { title: 'Người nhận', width: 100, dataIndex: 'recipients', align: 'right' },
          { title: 'SMS', width: 70, dataIndex: 'segments', align: 'right' },
          {
            title: 'Kết quả',
            width: 170,
            render: (_, c) =>
              c.status === 'CANCELLED' ? (
                ''
              ) : (
                <Space size={2}>
                  <Tooltip title="Thành công">
                    <Tag color="green">{c.counts.SUCCESS}</Tag>
                  </Tooltip>
                  <Tooltip title="Lỗi">
                    <Tag color="red">{c.counts.FAILED}</Tag>
                  </Tooltip>
                  <Tooltip title="Đang chờ">
                    <Tag color="blue">{c.counts.PENDING}</Tag>
                  </Tooltip>
                </Space>
              ),
          },
          {
            title: '',
            width: 110,
            render: (_, c) => (
              <Space>
                {c.status === 'SCHEDULED' && (
                  <Popconfirm title="Hủy tin nhắn hẹn giờ này?" okText="Hủy tin" cancelText="Không" onConfirm={() => act(() => api(`/sms/campaigns/${c.id}/cancel`, { method: 'POST' }), () => 'Đã hủy tin nhắn')}>
                    <Button size="small" danger icon={<CloseCircleOutlined />}>
                      Hủy
                    </Button>
                  </Popconfirm>
                )}
                {c.counts.FAILED > 0 && c.status !== 'CANCELLED' && (
                  <Button size="small" icon={<RedoOutlined />} onClick={() => act(() => api(`/sms/campaigns/${c.id}/retry`, { method: 'POST' }), (r) => `Đã gửi lại: ${r.counts.SUCCESS}/${r.recipients} thành công`)}>
                    Gửi lại
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <CampaignDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** One campaign: what was written, and each text with its delivery. */
function CampaignDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const { data: c } = useSWR<any>(id ? [`/sms/campaigns/${id}`] : null);
  const { data, isLoading } = useSWR<any>(id ? [`/sms/campaigns/${id}/messages`, { page, pageSize: 50, status }] : null);
  return (
    <Drawer open={!!id} onClose={() => (onClose(), setPage(1), setStatus(undefined))} width={900} title={c?.title ?? 'Tin nhắn'} destroyOnHidden>
      {c && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Space wrap>
            <Tag color={SMS_CAMPAIGN_STATUS[c.status].color}>{SMS_CAMPAIGN_STATUS[c.status].label}</Tag>
            <span>{c.label}</span>
            <Typography.Text type="secondary">
              {formatDateTime(c.scheduledAt, tz)} · {c.createdBy} · {c.accented ? 'có dấu' : 'không dấu'} · {c.recipients} người nhận, {c.segments} SMS
            </Typography.Text>
          </Space>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 8, borderRadius: 6, margin: 0 }}>{c.body}</Typography.Paragraph>
          {c.status === 'CANCELLED' && <Typography.Text type="secondary">Tin nhắn đã hủy trước giờ gửi, không tính vào hạn mức.</Typography.Text>}
        </Space>
      )}
      {c?.status !== 'CANCELLED' && (
        <>
          <Select
            placeholder="Mọi trạng thái"
            allowClear
            style={{ width: 160, marginBottom: 8 }}
            value={status}
            onChange={(v) => (setStatus(v), setPage(1))}
            options={Object.entries(SMS_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          />
          <Table<any>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={data?.items}
            scroll={{ x: 800 }}
            pagination={{ current: page, pageSize: 50, total: data?.total, onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: 'STT', dataIndex: 'seq', width: 55, align: 'center' },
              {
                title: 'Người nhận',
                width: 220,
                render: (_, m) => (
                  <>
                    <div>{m.name}</div>
                    {m.student && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        PH em {m.student.fullName}
                        {m.className ? `, lớp ${m.className}` : ''}
                      </div>
                    )}
                  </>
                ),
              },
              { title: 'Số điện thoại', dataIndex: 'phone', width: 120 },
              { title: 'Nội dung', render: (_, m) => <span style={{ fontSize: 13 }}>{m.body}</span> },
              {
                title: 'Trạng thái',
                width: 150,
                render: (_, m) => (
                  <>
                    <Tag color={SMS_STATUS[m.status].color}>{SMS_STATUS[m.status].label}</Tag>
                    {m.lastError && <div style={{ fontSize: 12, color: '#dc2626' }}>{m.lastError}</div>}
                    {m.sentAt && <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateTime(m.sentAt, tz)}</div>}
                  </>
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}

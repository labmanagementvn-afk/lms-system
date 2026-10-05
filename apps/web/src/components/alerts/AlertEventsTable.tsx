'use client';

import { CheckOutlined } from '@ant-design/icons';
import { App, Button, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ALERT_KIND } from '@/lib/labels';

export interface AlertEvent {
  id: string;
  date: string;
  kind: string;
  value: number;
  threshold: number;
  message: string;
  acknowledgedAt: string | null;
  createdAt: string;
  rule: { name: string; districtId: string | null } | null;
  school: { id: string; code: string; name: string } | null;
}

const dmy = (d: string) => d.split('-').reverse().join('/');

/**
 * Cảnh báo đã phát sinh: events raised by the alert rules, newest first, with acknowledgement.
 * `endpoint` is /alerts/events (school) or /district/alerts (district); ack posts to `${endpoint}/:id/ack`
 * for the district and /alerts/events/:id/ack for the school.
 */
export function AlertEventsTable({
  endpoint,
  ackEndpoint,
  canAck,
  showSchool = false,
  schoolLink,
  schools,
  pageSize = 20,
  compact = false,
  initialSchoolId,
}: {
  endpoint: string;
  ackEndpoint: (id: string) => string;
  canAck: boolean;
  showSchool?: boolean;
  /** Builds the link of a school row (district pages). */
  schoolLink?: (schoolId: string) => string;
  schools?: { id: string; name: string }[];
  pageSize?: number;
  compact?: boolean;
  /** Preselects one school (district pages). */
  initialSchoolId?: string;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState<'open' | 'all' | 'acked'>('open');
  const [kind, setKind] = useState<string>();
  const [schoolId, setSchoolId] = useState<string | undefined>(initialSchoolId);
  const [page, setPage] = useState(1);
  const query = { open: open === 'all' ? undefined : open === 'open', kind, schoolId, page, pageSize };
  const { data, isLoading, mutate } = useSWR<{ items: AlertEvent[]; total: number }>([endpoint, query]);

  async function ack(id: string) {
    try {
      await api(ackEndpoint(id), { method: 'POST' });
      message.success('Đã xác nhận cảnh báo');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      {!compact && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented
            value={open}
            onChange={(v) => {
              setOpen(v as typeof open);
              setPage(1);
            }}
            options={[
              { value: 'open', label: 'Chưa xử lý' },
              { value: 'acked', label: 'Đã xác nhận' },
              { value: 'all', label: 'Tất cả' },
            ]}
          />
          <Select allowClear placeholder="Loại cảnh báo" style={{ width: 220 }} value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={Object.entries(ALERT_KIND).map(([value, k]) => ({ value, label: k.label }))} />
          {schools && <Select allowClear showSearch optionFilterProp="label" placeholder="Trường" style={{ width: 240 }} value={schoolId} onChange={(v) => { setSchoolId(v); setPage(1); }} options={schools.map((s) => ({ value: s.id, label: s.name }))} />}
        </Space>
      )}
      <Table<AlertEvent>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={compact ? false : { current: page, pageSize, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} cảnh báo` }}
        locale={{ emptyText: open === 'open' ? 'Không có cảnh báo nào chờ xử lý' : 'Không có cảnh báo' }}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
          ...(showSchool
            ? [
                {
                  title: 'Trường',
                  width: 200,
                  render: (_: unknown, r: AlertEvent) => (r.school ? schoolLink ? <Link href={schoolLink(r.school.id)}>{r.school.name}</Link> : r.school.name : '—'),
                },
              ]
            : []),
          {
            title: 'Cảnh báo',
            render: (_, r) => (
              <>
                <Space size={6}>
                  <Tag color={r.acknowledgedAt ? 'default' : 'red'}>{ALERT_KIND[r.kind]?.label ?? r.kind}</Tag>
                  <Typography.Text strong>{r.rule?.name ?? ''}</Typography.Text>
                  {r.rule?.districtId && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      (quy tắc của Phòng/Sở)
                    </Typography.Text>
                  )}
                </Space>
                <div style={{ fontSize: 13 }}>{r.message}</div>
              </>
            ),
          },
          {
            title: 'Trạng thái',
            width: 150,
            render: (_, r) =>
              r.acknowledgedAt ? (
                <Tag color="green">Đã xác nhận</Tag>
              ) : canAck ? (
                <Button size="small" icon={<CheckOutlined />} onClick={() => ack(r.id)}>
                  Xác nhận
                </Button>
              ) : (
                <Tag color="orange">Chờ xử lý</Tag>
              ),
          },
        ]}
      />
    </>
  );
}

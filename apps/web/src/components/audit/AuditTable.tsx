'use client';

import { DatePicker, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { formatDateTime } from '@/components/lms/format';
import { AREA, HTTP_METHOD, ROLE } from '@/lib/labels';

interface AuditRow {
  id: string;
  method: string;
  path: string;
  area: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  body: unknown;
  durationMs: number;
  createdAt: string;
  userRole: string | null;
  user: { id: string; fullName: string; email: string | null; username: string | null; phone: string | null } | null;
  school: { id: string; code: string; name: string } | null;
}

const statusColor = (code: number) => (code >= 500 ? 'red' : code >= 400 ? 'orange' : 'green');

/**
 * Nhật ký hệ thống: who changed what, when, with the outcome. `endpoint` is the school's
 * own log (/audit) or the district's (/district/audit); the school column shows for the latter.
 */
export function AuditTable({ endpoint, areasEndpoint, showSchool = false, tz }: { endpoint: string; areasEndpoint?: string; showSchool?: boolean; tz: string }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ area?: string; method?: string; failed?: boolean; q?: string; from?: string; to?: string }>({});
  const { data, isLoading } = useSWR<{ items: AuditRow[]; total: number }>([endpoint, { ...filters, page, pageSize: 20 }]);
  const areas = useSWR<string[]>(areasEndpoint ? [areasEndpoint] : null);
  const areaOptions = (areas.data ?? Object.keys(AREA)).map((a) => ({ value: a, label: AREA[a] ?? a }));

  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear showSearch optionFilterProp="label" placeholder="Phân hệ" style={{ width: 180 }} options={areaOptions} value={filters.area} onChange={(v) => set({ area: v })} />
        <Select allowClear placeholder="Thao tác" style={{ width: 120 }} options={Object.entries(HTTP_METHOD).map(([value, m]) => ({ value, label: m.label }))} value={filters.method} onChange={(v) => set({ method: v })} />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          allowEmpty={[true, true]}
          onChange={(r) => set({ from: r?.[0]?.format('YYYY-MM-DD'), to: r?.[1]?.format('YYYY-MM-DD') })}
        />
        <Input.Search allowClear placeholder="Đường dẫn chứa…" style={{ width: 220 }} onSearch={(q) => set({ q: q || undefined })} />
        <span>
          <Switch size="small" checked={!!filters.failed} onChange={(v) => set({ failed: v || undefined })} /> <Typography.Text type="secondary">Chỉ lỗi</Typography.Text>
        </span>
      </Space>
      <Table<AuditRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} bản ghi` }}
        expandable={{
          expandedRowRender: (r) => (
            <div style={{ fontSize: 12 }}>
              <Space wrap style={{ marginBottom: 6 }}>
                <span>
                  <Typography.Text type="secondary">IP:</Typography.Text> {r.ip ?? '—'}
                </span>
                <span>
                  <Typography.Text type="secondary">Thời gian xử lý:</Typography.Text> {r.durationMs} ms
                </span>
                <span>
                  <Typography.Text type="secondary">Trình duyệt:</Typography.Text> {r.userAgent ?? '—'}
                </span>
              </Space>
              <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {r.body === null || r.body === undefined ? '(không có dữ liệu gửi lên)' : JSON.stringify(r.body, null, 2)}
              </pre>
            </div>
          ),
        }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (d: string) => formatDateTime(d, tz) },
          ...(showSchool ? [{ title: 'Trường', dataIndex: ['school', 'name'], width: 180, render: (_: unknown, r: AuditRow) => r.school?.name ?? <Typography.Text type="secondary">Phòng/Sở</Typography.Text> }] : []),
          {
            title: 'Người thực hiện',
            width: 200,
            render: (_, r) =>
              r.user ? (
                <>
                  {r.user.fullName}
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.user.email ?? r.user.username ?? r.user.phone} · {ROLE[r.userRole ?? ''] ?? r.userRole}
                  </Typography.Text>
                </>
              ) : (
                <Typography.Text type="secondary">Chưa đăng nhập</Typography.Text>
              ),
          },
          { title: 'Phân hệ', dataIndex: 'area', width: 130, render: (a: string) => AREA[a] ?? a },
          { title: 'Thao tác', dataIndex: 'method', width: 80, render: (m: string) => <Tag color={HTTP_METHOD[m]?.color}>{HTTP_METHOD[m]?.label ?? m}</Tag> },
          { title: 'Đường dẫn', dataIndex: 'path', render: (p: string) => <code style={{ fontSize: 12 }}>{p.replace(/^\/api\/v1/, '')}</code> },
          { title: 'Kết quả', dataIndex: 'statusCode', width: 90, render: (c: number) => <Tag color={statusColor(c)}>{c}</Tag> },
        ]}
      />
    </>
  );
}

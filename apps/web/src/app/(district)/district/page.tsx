'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Card, Col, DatePicker, Row, Space, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { AlertEventsTable } from '@/components/alerts/AlertEventsTable';
import { SchoolsTable } from '@/components/district/SchoolsTable';
import { PageHeader } from '@/components/PageHeader';
import { TrendChart } from '@/components/stats/TrendChart';

const pct = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const vnd = (v: number) => v.toLocaleString('vi-VN');

/** District overview: totals for the day, the two-week trend across schools, the per-school table and open alerts. */
export default function DistrictOverviewPage() {
  const [date, setDate] = useState<string>();
  const { data, isLoading } = useSWR<any>(['/district/overview', { date }]);
  const trend = useSWR<any>(['/district/trend', { days: 14 }]);
  const t = data?.totals;

  return (
    <>
      <PageHeader
        title={data?.district?.name ?? 'Tổng quan'}
        extra={
          <Space>
            <span>Số liệu ngày</span>
            <DatePicker
              allowClear={false}
              format="DD/MM/YYYY"
              value={dayjs(date ?? data?.date ?? undefined)}
              disabledDate={(d) => d.isAfter(dayjs(), 'day')}
              onChange={(d) => setDate(d.format('YYYY-MM-DD'))}
            />
          </Space>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Trường" value={t?.schools ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Học sinh" value={t?.students ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Giáo viên" value={t?.teachers ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Lớp học" value={t?.classes ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic
              title="Chuyên cần"
              value={t?.attendanceRate != null ? pct(t.attendanceRate) : '-'}
              suffix={t?.attendanceRate != null ? '%' : undefined}
              valueStyle={t?.attendanceRate != null && t.attendanceRate < 90 ? { color: '#d97706' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Muộn / vắng" value={t ? `${t.late} / ${t.absent}` : '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic title="Công nợ quá hạn" value={t ? vnd(t.overdueAmount) : '-'} suffix={t ? '₫' : undefined} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card>
            <Statistic
              title={<Link href="/district/alerts">Cảnh báo chờ xử lý</Link>}
              value={t?.openAlerts ?? '-'}
              valueStyle={t?.openAlerts ? { color: '#d03b3b' } : undefined}
              prefix={t?.openAlerts ? <WarningOutlined /> : undefined}
            />
          </Card>
        </Col>
      </Row>
      {t && t.reported < t.schools && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {t.schools - t.reported} trường chưa có số liệu ngày này (số liệu được tính mỗi đêm).
        </Typography.Paragraph>
      )}

      <Typography.Title level={4} style={{ marginTop: 24 }}>
        Toàn Phòng/Sở, 14 ngày qua
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ chuyên cần (%)" size="small">
            <TrendChart data={trend.data?.items ?? []} series={[{ key: 'attendanceRate', label: 'Chuyên cần', format: pct }]} max={100} unit="%" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Đi muộn và vắng (học sinh)" size="small">
            <TrendChart data={trend.data?.items ?? []} kind="columns" series={[{ key: 'late', label: 'Đi muộn' }, { key: 'absent', label: 'Vắng' }]} />
          </Card>
        </Col>
      </Row>

      <Typography.Title level={4} style={{ marginTop: 24 }}>
        Các trường ({data?.date ? dayjs(data.date).format('DD/MM/YYYY') : ''})
      </Typography.Title>
      <SchoolsTable rows={data?.schools} loading={isLoading} />

      <Typography.Title level={4} style={{ marginTop: 24 }}>
        Cảnh báo mới nhất
      </Typography.Title>
      <AlertEventsTable endpoint="/district/alerts" ackEndpoint={(id) => `/district/alerts/${id}/ack`} canAck showSchool schoolLink={(id) => `/district/schools/${id}`} pageSize={8} compact />
    </>
  );
}

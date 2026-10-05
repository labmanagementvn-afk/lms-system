'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { TrendChart } from '@/components/stats/TrendChart';
import { useAuth } from '@/lib/auth';

const pct = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const vnd = (v: number) => v.toLocaleString('vi-VN');

export default function DashboardPage() {
  const { me } = useAuth();
  const { data: teachers } = useSWR<{ total: number }>(['/teachers', { pageSize: 1 }]);
  const { data: students } = useSWR<{ total: number }>(['/students', { pageSize: 1, status: 'STUDYING' }]);
  const { data: classes } = useSWR<any[]>(['/classes']);
  const { data: daily } = useSWR<any>(['/attendance/daily']);
  const { data: summary } = useSWR<any>(['/stats/summary', { days: 14 }]);
  const admin = me?.role === 'ADMIN';

  return (
    <>
      <PageHeader title="Tổng quan" />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Giáo viên" value={teachers?.total ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Học sinh đang học" value={students?.total ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Lớp học (năm học hiện tại)" value={classes?.length ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={admin ? <Link href="/settings/alerts">Cảnh báo chờ xử lý</Link> : 'Cảnh báo chờ xử lý'}
              value={summary?.openAlerts ?? '-'}
              valueStyle={summary?.openAlerts ? { color: '#d03b3b' } : undefined}
              prefix={summary?.openAlerts ? <WarningOutlined /> : undefined}
            />
          </Card>
        </Col>
      </Row>
      <Typography.Title level={4} style={{ marginTop: 24 }}>
        Điểm danh hôm nay ({dayjs().format('DD/MM/YYYY')})
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Đã vào trường" value={daily ? daily.summary.onTime + daily.summary.late : '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Đúng giờ" value={daily?.summary.onTime ?? '-'} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Đi muộn" value={daily?.summary.late ?? '-'} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Chưa vào / vắng" value={daily?.summary.absent ?? '-'} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
      </Row>
      <Typography.Title level={4} style={{ marginTop: 24 }}>
        14 ngày qua
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ chuyên cần (%)" size="small">
            <TrendChart data={summary?.trend ?? []} series={[{ key: 'attendanceRate', label: 'Chuyên cần', format: pct }]} max={100} unit="%" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Đi muộn và vắng (học sinh)" size="small">
            <TrendChart data={summary?.trend ?? []} kind="columns" series={[{ key: 'late', label: 'Đi muộn' }, { key: 'absent', label: 'Vắng' }]} />
          </Card>
        </Col>
        {me?.role !== 'TEACHER' && (
          <>
            <Col xs={24} lg={12}>
              <Card title="Tiền thu trong ngày (₫)" size="small">
                <TrendChart data={summary?.trend ?? []} kind="columns" series={[{ key: 'revenue', label: 'Thu trong ngày', format: vnd }]} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Hoạt động e-learning (học sinh)" size="small">
                <TrendChart data={summary?.trend ?? []} kind="columns" series={[{ key: 'lmsActiveStudents', label: 'Học bài' }, { key: 'testsSubmitted', label: 'Bài kiểm tra nộp' }]} />
              </Card>
            </Col>
          </>
        )}
      </Row>
    </>
  );
}

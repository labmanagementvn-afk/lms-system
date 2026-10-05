'use client';

import { Card, Col, Row, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
  const { me } = useAuth();
  const { data: teachers } = useSWR<{ total: number }>(['/teachers', { pageSize: 1 }]);
  const { data: students } = useSWR<{ total: number }>(['/students', { pageSize: 1, status: 'STUDYING' }]);
  const { data: classes } = useSWR<any[]>(['/classes']);
  const { data: daily } = useSWR<any>(['/attendance/daily']);

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
            <Statistic title="Giờ vào muộn sau" value={me?.school.lateAfter ?? '-'} />
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
    </>
  );
}

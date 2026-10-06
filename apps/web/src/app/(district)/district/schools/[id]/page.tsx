'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Row, Statistic, Table, Tag } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertEventsTable } from '@/components/alerts/AlertEventsTable';
import { PageHeader } from '@/components/PageHeader';
import { TrendChart } from '@/components/stats/TrendChart';

const pct = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const vnd = (v: number) => v.toLocaleString('vi-VN');

/** One school as the district sees it: profile, contacts, classes, the 14-day trend and its alerts. */
export default function DistrictSchoolPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSWR<any>([`/district/schools/${id}`, { days: 14 }]);
  const s = data?.school;
  const w = data?.window;

  return (
    <>
      <PageHeader
        title={s?.name ?? 'Trường'}
        extra={
          <Link href="/district/schools">
            <Button icon={<ArrowLeftOutlined />}>Danh sách trường</Button>
          </Link>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card size="small" title="Thông tin" loading={isLoading}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Mã trường">{s?.code}</Descriptions.Item>
              <Descriptions.Item label="Mã CSDL ngành">{s?.moetCode ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{s?.address ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Giờ vào học">{s?.lateAfter}</Descriptions.Item>
              <Descriptions.Item label="Liên hệ">
                {data?.contacts?.length ? data.contacts.map((c: any) => <div key={c.email ?? c.phone}>{c.fullName} · {c.email ?? c.phone}</div>) : '—'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Học sinh" value={data?.counts?.students ?? '-'} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Giáo viên" value={data?.counts?.teachers ?? '-'} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Lớp" value={data?.counts?.classes ?? '-'} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Chuyên cần 14 ngày" value={w?.attendanceRate != null ? pct(w.attendanceRate) : '-'} suffix={w?.attendanceRate != null ? '%' : undefined} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Thu 14 ngày (₫)" value={w ? vnd(w.revenue) : '-'} valueStyle={{ fontSize: 20 }} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Sự cố y tế 14 ngày" value={w?.healthIncidents ?? '-'} />
              </Card>
            </Col>
          </Row>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ chuyên cần (%)" size="small">
            <TrendChart data={data?.stats ?? []} series={[{ key: 'attendanceRate', label: 'Chuyên cần', format: pct }]} max={100} unit="%" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Đi muộn và vắng (học sinh)" size="small">
            <TrendChart data={data?.stats ?? []} kind="columns" series={[{ key: 'late', label: 'Đi muộn' }, { key: 'absent', label: 'Vắng' }]} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Lớp học (năm học hiện tại)" size="small">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data?.classes}
              columns={[
                { title: 'Lớp', dataIndex: 'name' },
                { title: 'Khối', dataIndex: 'gradeLevel', width: 70, render: (g: number) => <Tag>{g}</Tag> },
                { title: 'Sĩ số', dataIndex: 'students', width: 80, align: 'right' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Cảnh báo của trường" size="small">
            <AlertEventsTable endpoint="/district/alerts" ackEndpoint={(eid) => `/district/alerts/${eid}/ack`} canAck pageSize={10} compact initialSchoolId={id} />
          </Card>
        </Col>
      </Row>
    </>
  );
}

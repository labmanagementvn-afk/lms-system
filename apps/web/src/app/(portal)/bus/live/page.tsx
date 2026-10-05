'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, List, Result, Row, Space, Spin, Statistic, Typography } from 'antd';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { TripDetailDrawer } from '@/components/bus/TripDetailDrawer';
import { countsText, DirectionTag, TripStatusTag } from '@/components/bus/tags';
import { canEditStudents, useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/time';

const BusMap = dynamic(() => import('@/components/bus/BusMap'), { ssr: false, loading: () => <Spin /> });

const ORDER: Record<string, number> = { RUNNING: 0, PLANNED: 1, DONE: 2, CANCELLED: 3 };
const byStatus = (a: any, b: any) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.route.startTime.localeCompare(b.route.startTime);

/** Today's running buses on a map (polled every 10 s) with the day's trip list beside it. */
export default function LivePage() {
  const { me } = useAuth();
  const tz = me?.school.timezone ?? 'Asia/Ho_Chi_Minh';
  const { data: live, isLoading, isValidating, mutate: mutateLive } = useSWR<any>(['/bus/live'], { refreshInterval: 10_000 });
  const { data: all, mutate: mutateAll } = useSWR<any>(['/bus/trips'], { refreshInterval: 30_000 });
  const [selected, setSelected] = useState<string | null>(null);

  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Bản đồ xe đưa đón dành cho văn phòng nhà trường." />;
  }

  const running: any[] = live?.items ?? [];
  const trips: any[] = all?.items ?? [];
  const refresh = () => {
    mutateLive();
    mutateAll();
  };
  const markers = running
    .filter((t) => t.lastLocation)
    .map((t) => ({
      id: t.id,
      lat: t.lastLocation.lat,
      lng: t.lastLocation.lng,
      kind: 'bus' as const,
      label: `${t.route.name}${t.vehicle ? ` · ${t.vehicle.plateNumber}` : ''}`,
      popup: (
        <div style={{ minWidth: 180 }}>
          <b>{t.route.name}</b>
          <br />
          {t.vehicle?.plateNumber ?? 'Chưa gán xe'} · {t.driver?.fullName ?? 'Chưa gán lái xe'}
          <br />
          {countsText(t.counts)}
          <br />
          Cập nhật {formatTime(t.lastLocation.at, tz, true)}
          <br />
          <a onClick={() => setSelected(t.id)}>Xem chi tiết</a>
        </div>
      ),
    }));

  return (
    <>
      <PageHeader
        title="Bản đồ xe trực tiếp"
        extra={
          <Space>
            <Typography.Text type="secondary">Tự làm mới mỗi 10 giây</Typography.Text>
            <Button icon={<ReloadOutlined />} loading={isValidating} onClick={refresh}>
              Làm mới
            </Button>
          </Space>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card size="small" styles={{ body: { padding: 8 } }}>
            {isLoading ? (
              <div style={{ height: 560, display: 'grid', placeItems: 'center' }}>
                <Spin />
              </div>
            ) : markers.length ? (
              <BusMap markers={markers} height={560} />
            ) : (
              <div style={{ height: 560, display: 'grid', placeItems: 'center' }}>
                <Empty description={running.length ? 'Xe đang chạy nhưng chưa có tín hiệu GPS' : 'Hiện không có chuyến xe nào đang chạy'} />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space size="large" wrap>
              <Statistic title="Đang chạy" value={running.length} />
              <Statistic title="Chuyến hôm nay" value={trips.length} />
              <Statistic title="HS trên xe" value={running.reduce((s, t) => s + t.counts.onBus, 0)} />
            </Space>
          </Card>
          <List
            dataSource={[...trips].sort(byStatus)}
            locale={{ emptyText: 'Hôm nay không có chuyến xe' }}
            renderItem={(t) => (
              <Card
                size="small"
                hoverable
                onClick={() => setSelected(t.id)}
                style={{ marginBottom: 8, borderColor: t.status === 'RUNNING' ? '#1d4ed8' : undefined }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space wrap size={4}>
                    <b>{t.route.name}</b>
                    <DirectionTag direction={t.route.direction} />
                    <TripStatusTag status={t.status} />
                  </Space>
                  <Typography.Text type="secondary">
                    {t.route.startTime} · {t.vehicle?.plateNumber ?? 'chưa gán xe'} · {t.driver?.fullName ?? 'chưa gán lái xe'}
                  </Typography.Text>
                  <Typography.Text>{countsText(t.counts)}</Typography.Text>
                  {t.lastLocation && <Typography.Text type="secondary">Vị trí cập nhật {formatTime(t.lastLocation.at, tz, true)}</Typography.Text>}
                </Space>
              </Card>
            )}
          />
        </Col>
      </Row>
      <TripDetailDrawer id={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </>
  );
}

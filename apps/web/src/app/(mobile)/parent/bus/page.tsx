'use client';

import { PhoneOutlined } from '@ant-design/icons';
import { Alert, Card, Descriptions, Empty, Space, Spin, Typography } from 'antd';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { EventsTimeline } from '@/components/bus/TripDetailDrawer';
import { DirectionTag, StateTag, TripStatusTag } from '@/components/bus/tags';
import { useAuth } from '@/lib/auth';
import { useParent } from '@/lib/parent';
import { formatTime } from '@/lib/time';

const BusMap = dynamic(() => import('@/components/bus/BusMap'), { ssr: false, loading: () => <Spin /> });

/** The child's bus: route, stop and crew, plus today's trips with the bus on a map while it runs (polled every 15 s). */
export default function ParentBusPage() {
  const { child } = useParent();
  const { me } = useAuth();
  const tz = me?.school.timezone ?? 'Asia/Ho_Chi_Minh';
  const { data, error, isLoading } = useSWR<any>(child ? [`/parent/children/${child.id}/bus`] : null, {
    refreshInterval: (d) => (d?.today?.some((t: any) => t.trip.status === 'RUNNING') ? 15_000 : 0),
  });

  if (!child) return <Empty description="Chưa có thông tin học sinh" style={{ marginTop: 40 }} />;
  if (error) return <Alert type="error" showIcon message={(error as Error).message} />;
  if (isLoading || !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }
  if (!data.assignments.length) return <Empty description="Con chưa đăng ký xe đưa đón" style={{ marginTop: 40 }} />;

  const stopOf = (routeId: string) => data.assignments.find((a: any) => a.route.id === routeId)?.stop;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Xe đưa đón · {child.fullName}
      </Typography.Title>

      {data.today.map((t: any) => {
        const stop = stopOf(t.route.id);
        const hasBus = t.trip.lastLat !== null && t.trip.lastLng !== null;
        const markers = [
          ...(hasBus ? [{ id: `bus-${t.trip.id}`, lat: t.trip.lastLat as number, lng: t.trip.lastLng as number, kind: 'bus' as const, label: t.vehicle?.plateNumber ?? 'Xe' }] : []),
          ...(stop ? [{ id: `stop-${stop.id}`, lat: stop.lat as number, lng: stop.lng as number, kind: 'home' as const, label: stop.name }] : []),
        ];
        return (
          <Card
            key={t.trip.id}
            size="small"
            title={
              <Space wrap size={4}>
                {t.route.name}
                <DirectionTag direction={t.route.direction} />
              </Space>
            }
            extra={<TripStatusTag status={t.trip.status} />}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <StateTag state={t.state} />
                {t.trip.startedAt && (
                  <Typography.Text type="secondary">
                    Xe chạy từ {formatTime(t.trip.startedAt, tz)}
                    {t.trip.endedAt ? `, kết thúc ${formatTime(t.trip.endedAt, tz)}` : ''}
                  </Typography.Text>
                )}
              </Space>
              {t.trip.status === 'RUNNING' && (
                <Typography.Text type="secondary">
                  {t.trip.lastLocationAt ? `Vị trí xe cập nhật lúc ${formatTime(t.trip.lastLocationAt, tz, true)}` : 'Đang chờ tín hiệu GPS từ xe...'}
                </Typography.Text>
              )}
              {markers.length > 0 && t.trip.status !== 'CANCELLED' && <BusMap markers={markers} height={240} follow />}
              <EventsTimeline events={t.events} timeZone={tz} withStudent={false} />
            </Space>
          </Card>
        );
      })}

      {data.assignments.map((a: any) => (
        <Card
          key={a.route.id}
          size="small"
          title={
            <Space wrap size={4}>
              {a.route.name}
              <DirectionTag direction={a.route.direction} />
            </Space>
          }
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Điểm đón">
              {a.stop.name}
              {a.stop.address ? ` · ${a.stop.address}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Giờ dự kiến">{a.stop.plannedTime ?? a.route.startTime}</Descriptions.Item>
            <Descriptions.Item label="Xe">{a.vehicle?.plateNumber ?? 'Chưa gán'}</Descriptions.Item>
            <Descriptions.Item label="Lái xe">
              {a.driver ? (
                <span>
                  {a.driver.fullName} ·{' '}
                  <a href={`tel:${a.driver.phone}`}>
                    <PhoneOutlined /> {a.driver.phone}
                  </a>
                </span>
              ) : (
                'Chưa gán'
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ))}
    </Space>
  );
}

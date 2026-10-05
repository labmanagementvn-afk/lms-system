'use client';

import { RightOutlined } from '@ant-design/icons';
import { Alert, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import useSWR from 'swr';
import { countsText, DirectionTag, TripStatusTag } from '@/components/bus/tags';
import { BUS_STAFF_ROLE } from '@/lib/labels';

/** Today's trips on the routes the signed-in driver or monitor crews. */
export default function DriverHomePage() {
  const { data, error, isLoading } = useSWR<any>(['/driver/trips'], { refreshInterval: 30_000 });

  if (error) return <Alert type="error" showIcon message="Không tải được chuyến xe" description={(error as Error).message} />;
  if (isLoading || !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }
  const items: any[] = data.items;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Chuyến xe hôm nay · {dayjs(data.date).format('DD/MM/YYYY')}
        </Typography.Title>
        <Typography.Text type="secondary">
          {data.staff.fullName} · {BUS_STAFF_ROLE[data.staff.role]}
        </Typography.Text>
      </div>
      {!items.length && <Empty description="Hôm nay bạn không có chuyến xe nào" style={{ marginTop: 40 }} />}
      {items.map((t) => (
        <Link key={t.id} href={`/driver/trips/${t.id}`} style={{ color: 'inherit' }}>
          <Card size="small" hoverable style={{ borderColor: t.status === 'RUNNING' ? '#1d4ed8' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Space direction="vertical" size={4}>
                <Space wrap size={4}>
                  <b style={{ fontSize: 16 }}>{t.route.name}</b>
                  <DirectionTag direction={t.route.direction} />
                </Space>
                <Space wrap size={4}>
                  <Tag>Xuất phát {t.route.startTime}</Tag>
                  <TripStatusTag status={t.status} />
                  {t.myRole === 'MONITOR' && <Tag color="cyan">Phụ xe</Tag>}
                </Space>
                <Typography.Text type="secondary">
                  {t.vehicle?.plateNumber ?? 'Chưa gán xe'} · {countsText(t.counts)}
                </Typography.Text>
              </Space>
              <RightOutlined style={{ color: '#9ca3af' }} />
            </div>
          </Card>
        </Link>
      ))}
    </Space>
  );
}

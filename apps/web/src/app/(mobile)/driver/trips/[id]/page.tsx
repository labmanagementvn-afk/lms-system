'use client';

import { ArrowLeftOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Space, Spin, Typography } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { EventsTimeline, RosterByStop } from '@/components/bus/TripDetailDrawer';
import { countsText, DirectionTag, TripStatusTag } from '@/components/bus/tags';
import { GPS_LABEL, useLocationSender } from '@/components/bus/useLocationSender';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/time';

/** One trip for the crew: start it, send GPS while running, tick students on and off, end it. */
export default function DriverTripPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const tz = me?.school.timezone ?? 'Asia/Ho_Chi_Minh';
  const { message, modal } = App.useApp();
  const { data: trip, error, mutate } = useSWR<any>([`/driver/trips/${id}`], { refreshInterval: (d) => (d?.status === 'RUNNING' ? 15_000 : 0) });
  const [busy, setBusy] = useState<string | null>(null);
  const running = trip?.status === 'RUNNING';
  const gps = useLocationSender(id, running);

  async function act(key: string, path: string, body?: unknown, ok?: string) {
    setBusy(key);
    try {
      await api(path, { method: 'POST', body });
      if (ok) message.success(ok);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const start = () => act('start', `/driver/trips/${id}/start`, undefined, 'Đã bắt đầu chuyến');
  const board = (student: any, type: 'BOARD' | 'ALIGHT') =>
    act(`${type}:${student.id}`, `/driver/trips/${id}/boarding`, { studentId: student.id, type, ...(gps.position.current ?? {}) });
  const end = () =>
    modal.confirm({
      title: 'Kết thúc chuyến?',
      content: trip.counts.onBus ? `Còn ${trip.counts.onBus} học sinh đang được đánh dấu trên xe.` : undefined,
      okText: 'Kết thúc',
      okButtonProps: { danger: true },
      cancelText: 'Chưa',
      onOk: () => act('end', `/driver/trips/${id}/end`, undefined, 'Đã kết thúc chuyến'),
    });

  if (error) return <Alert type="error" showIcon message="Không tải được chuyến xe" description={(error as Error).message} />;
  if (!trip) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Link href="/driver">
        <ArrowLeftOutlined /> Chuyến xe hôm nay
      </Link>
      <Card size="small">
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space wrap size={4}>
            <b style={{ fontSize: 18 }}>{trip.route.name}</b>
            <DirectionTag direction={trip.route.direction} />
            <TripStatusTag status={trip.status} />
          </Space>
          <Typography.Text type="secondary">
            Xuất phát {trip.route.startTime} · {trip.vehicle?.plateNumber ?? 'chưa gán xe'}
            {trip.monitor ? ` · Phụ xe: ${trip.monitor.fullName}` : ''}
          </Typography.Text>
          <Typography.Text>{countsText(trip.counts)}</Typography.Text>
          {trip.startedAt && (
            <Typography.Text type="secondary">
              Bắt đầu {formatTime(trip.startedAt, tz)}
              {trip.endedAt ? ` · Kết thúc ${formatTime(trip.endedAt, tz)}` : ''}
            </Typography.Text>
          )}
        </Space>
      </Card>

      {trip.status === 'PLANNED' && (
        <Button type="primary" size="large" block loading={busy === 'start'} onClick={start} style={{ height: 56, fontSize: 18 }}>
          Bắt đầu chuyến
        </Button>
      )}
      {running && (
        <Alert
          type={gps.status === 'sending' ? 'success' : gps.status === 'waiting' ? 'info' : 'warning'}
          showIcon
          icon={<EnvironmentOutlined />}
          message={GPS_LABEL[gps.status]}
          description={gps.lastSentAt ? `Gửi vị trí lần cuối lúc ${formatTime(gps.lastSentAt.toISOString(), tz, true)}` : 'Giữ màn hình này mở để phụ huynh thấy xe trên bản đồ.'}
        />
      )}
      {trip.status === 'CANCELLED' && <Alert type="warning" showIcon message="Chuyến đã bị hủy" />}
      {trip.status === 'DONE' && <Alert type="success" showIcon message="Chuyến đã hoàn thành" />}

      <RosterByStop
        stops={trip.stops}
        timeZone={tz}
        renderAction={(st) =>
          st.state === 'ON_BUS' ? (
            <Button loading={busy === `ALIGHT:${st.id}`} disabled={!running} onClick={() => board(st, 'ALIGHT')}>
              Xuống xe
            </Button>
          ) : (
            <Button type="primary" loading={busy === `BOARD:${st.id}`} disabled={!running} onClick={() => board(st, 'BOARD')}>
              {st.state === 'ALIGHTED' ? 'Lên lại' : 'Lên xe'}
            </Button>
          )
        }
      />

      {running && (
        <Button danger size="large" block loading={busy === 'end'} onClick={end} style={{ height: 52 }}>
          Kết thúc chuyến
        </Button>
      )}
      <Card size="small" title="Nhật ký lên / xuống xe">
        <EventsTimeline events={trip.events} timeZone={tz} />
      </Card>
    </Space>
  );
}

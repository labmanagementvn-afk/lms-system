'use client';

import { App, Button, Card, Descriptions, Drawer, Empty, List, Popconfirm, Space, Timeline, Typography } from 'antd';
import { ReactNode } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BOARDING_TYPE } from '@/lib/labels';
import { formatTime } from '@/lib/time';
import { countsText, DirectionTag, StateTag, TripStatusTag } from './tags';

/** Assigned students grouped by stop, each with their state on the trip. Shared by the office drawer and the driver app. */
export function RosterByStop({ stops, timeZone, renderAction }: { stops: any[]; timeZone: string; renderAction?: (student: any, stop: any) => ReactNode }) {
  if (!stops.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tuyến chưa có điểm đón" />;
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {stops.map((s) => (
        <Card
          key={s.id}
          size="small"
          title={`${s.order}. ${s.name}${s.plannedTime ? ` · ${s.plannedTime}` : ''}`}
          extra={<Typography.Text type="secondary">{s.students.length} học sinh</Typography.Text>}
        >
          {s.students.length ? (
            <List
              size="small"
              dataSource={s.students}
              renderItem={(st: any) => (
                <List.Item actions={renderAction ? [renderAction(st, s)] : undefined}>
                  <List.Item.Meta
                    title={`${st.fullName}${st.class ? ` (${st.class.name})` : ''}`}
                    description={st.lastEvent ? `${BOARDING_TYPE[st.lastEvent.type]} lúc ${formatTime(st.lastEvent.occurredAt, timeZone)}` : undefined}
                  />
                  <StateTag state={st.state} />
                </List.Item>
              )}
            />
          ) : (
            <Typography.Text type="secondary">Không có học sinh tại điểm này</Typography.Text>
          )}
        </Card>
      ))}
    </Space>
  );
}

export function EventsTimeline({ events, timeZone, withStudent = true }: { events: any[]; timeZone: string; withStudent?: boolean }) {
  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có sự kiện lên / xuống xe" />;
  return (
    <Timeline
      items={events.map((e) => ({
        color: e.type === 'BOARD' ? 'blue' : 'green',
        children: `${formatTime(e.occurredAt, timeZone)} · ${withStudent && e.student ? `${e.student.fullName} ` : ''}${BOARDING_TYPE[e.type]?.toLowerCase() ?? e.type}${e.stop ? ` tại ${e.stop.name}` : ''}`,
      }))}
    />
  );
}

/** One trip for the school office: crew, roster by stop and the boarding log; refreshes every 10 s while running. */
export function TripDetailDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { message } = App.useApp();
  const { data: trip, mutate } = useSWR<any>(id ? [`/bus/trips/${id}`] : null, { refreshInterval: (latest) => (latest?.status === 'RUNNING' ? 10_000 : 0) });

  async function cancel() {
    try {
      await api(`/bus/trips/${id}/cancel`, { method: 'POST' });
      message.success('Đã hủy chuyến');
      mutate();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={640}
      title={trip ? `${trip.route.name} · ${trip.date.split('-').reverse().join('/')}` : 'Chuyến xe'}
      destroyOnHidden
      extra={
        trip && (trip.status === 'PLANNED' || trip.status === 'RUNNING') ? (
          <Popconfirm title="Hủy chuyến này?" onConfirm={cancel}>
            <Button danger size="small">
              Hủy chuyến
            </Button>
          </Popconfirm>
        ) : null
      }
    >
      {trip && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Trạng thái">
              <TripStatusTag status={trip.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Chiều">
              <DirectionTag direction={trip.route.direction} />
            </Descriptions.Item>
            <Descriptions.Item label="Xe">{trip.vehicle?.plateNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Giờ xuất phát">{trip.route.startTime}</Descriptions.Item>
            <Descriptions.Item label="Lái xe">{trip.driver ? `${trip.driver.fullName} · ${trip.driver.phone}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Phụ xe">{trip.monitor ? `${trip.monitor.fullName} · ${trip.monitor.phone}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Bắt đầu">{formatTime(trip.startedAt, tz) || '—'}</Descriptions.Item>
            <Descriptions.Item label="Kết thúc">{formatTime(trip.endedAt, tz) || '—'}</Descriptions.Item>
            <Descriptions.Item label="Học sinh" span={2}>
              {countsText(trip.counts)}
            </Descriptions.Item>
            <Descriptions.Item label="Vị trí cuối" span={2}>
              {trip.lastLocation ? `${trip.lastLocation.lat.toFixed(5)}, ${trip.lastLocation.lng.toFixed(5)} lúc ${formatTime(trip.lastLocation.at, tz, true)}` : 'Chưa có tín hiệu GPS'}
            </Descriptions.Item>
          </Descriptions>
          <RosterByStop stops={trip.stops} timeZone={tz} />
          <Card size="small" title="Nhật ký lên / xuống xe">
            <EventsTimeline events={trip.events} timeZone={tz} />
          </Card>
        </Space>
      )}
    </Drawer>
  );
}

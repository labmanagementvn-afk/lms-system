'use client';

import { DeleteOutlined, PlayCircleOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { App, Button, List, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { LIVE_STATUS } from '@/lib/labels';
import { countdown, formatDateTime, formatTime } from './format';

export type LiveSession = {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  roomName: string;
  joinUrl: string;
  attendanceCount: number;
  course: { id: string; title: string };
};

/** Live rooms with start / end / cancel / delete, a "join" link and an expandable attendance list. */
export function LiveSessionsTable({ sessions, loading, tz, showCourse, onChanged }: { sessions: LiveSession[] | undefined; loading?: boolean; tz: string; showCourse?: boolean; onChanged: () => void }) {
  const { message } = App.useApp();

  async function act(path: string, ok: string, method = 'POST') {
    try {
      await api(path, { method });
      message.success(ok);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Table<LiveSession>
      rowKey="id"
      loading={loading}
      dataSource={sessions}
      pagination={{ pageSize: 20, hideOnSinglePage: true }}
      scroll={{ x: 900 }}
      expandable={{ expandedRowRender: (s) => <AttendanceList id={s.id} tz={tz} />, rowExpandable: (s) => s.attendanceCount > 0 }}
      columns={[
        {
          title: 'Lớp học',
          render: (_, s) => (
            <>
              <Typography.Text strong>{s.title}</Typography.Text>
              {showCourse && <div style={{ fontSize: 12, color: '#64748b' }}>{s.course.title}</div>}
            </>
          ),
        },
        {
          title: 'Thời gian',
          width: 220,
          render: (_, s) => (
            <>
              {formatDateTime(s.startsAt, tz)} · {s.durationMin} phút
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {s.status === 'SCHEDULED' && countdown(s.startsAt)}
                {s.status === 'LIVE' && s.startedAt && `Bắt đầu lúc ${formatTime(s.startedAt, tz)}`}
                {s.status === 'ENDED' && s.endedAt && `Kết thúc lúc ${formatTime(s.endedAt, tz)}`}
              </div>
            </>
          ),
        },
        { title: 'Trạng thái', width: 120, render: (_, s) => <Tag color={LIVE_STATUS[s.status]?.color}>{LIVE_STATUS[s.status]?.label ?? s.status}</Tag> },
        { title: 'Tham dự', width: 90, align: 'right', render: (_, s) => s.attendanceCount },
        {
          title: '',
          width: 300,
          render: (_, s) => (
            <Space wrap>
              {(s.status === 'LIVE' || s.status === 'SCHEDULED') && (
                <Button size="small" type={s.status === 'LIVE' ? 'primary' : 'default'} icon={<VideoCameraOutlined />} onClick={() => window.open(s.joinUrl, '_blank', 'noopener')}>
                  Vào lớp
                </Button>
              )}
              {s.status === 'SCHEDULED' && (
                <Button size="small" icon={<PlayCircleOutlined />} onClick={() => act(`/lms/live/${s.id}/start`, 'Đã bắt đầu lớp học; học sinh đã được thông báo')}>
                  Bắt đầu
                </Button>
              )}
              {s.status === 'LIVE' && (
                <Popconfirm title="Kết thúc lớp học này?" okText="Kết thúc" cancelText="Hủy" onConfirm={() => act(`/lms/live/${s.id}/end`, 'Đã kết thúc lớp học')}>
                  <Button size="small" danger icon={<StopOutlined />}>
                    Kết thúc
                  </Button>
                </Popconfirm>
              )}
              {s.status === 'SCHEDULED' && (
                <Popconfirm title="Hủy lớp học này?" okText="Hủy lớp" cancelText="Không" onConfirm={() => act(`/lms/live/${s.id}/cancel`, 'Đã hủy lớp học')}>
                  <Button size="small">Hủy</Button>
                </Popconfirm>
              )}
              {(s.status === 'SCHEDULED' || s.status === 'CANCELLED') && (
                <Popconfirm title="Xóa lớp học này?" okText="Xóa" cancelText="Hủy" onConfirm={() => act(`/lms/live/${s.id}`, 'Đã xóa', 'DELETE')}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ]}
    />
  );
}

function AttendanceList({ id, tz }: { id: string; tz: string }) {
  const { data, isLoading } = useSWR<any>([`/lms/live/${id}`]);
  return (
    <List
      size="small"
      loading={isLoading}
      dataSource={data?.attendances ?? []}
      grid={{ gutter: 8, xs: 1, sm: 2, md: 3, lg: 4 }}
      renderItem={(a: any) => (
        <List.Item style={{ marginBottom: 4 }}>
          <Typography.Text>
            {a.student.code} · {a.student.fullName}
            {a.student.class && ` (${a.student.class.name})`}
          </Typography.Text>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Vào {formatTime(a.joinedAt, tz)}
            {a.leftAt ? ` · rời ${formatTime(a.leftAt, tz)}` : ' · đang trong lớp'}
          </div>
        </List.Item>
      )}
    />
  );
}

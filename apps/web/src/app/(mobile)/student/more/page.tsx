'use client';

import { BellOutlined, LogoutOutlined, MessageOutlined, RightOutlined, TrophyOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, List, Typography } from 'antd';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { GENDER } from '@/lib/labels';
import { useStudent } from '@/lib/student';

const ITEMS = [
  { href: '/student/live', icon: <VideoCameraOutlined />, label: 'Lớp học trực tuyến' },
  { href: '/student/contests', icon: <TrophyOutlined />, label: 'Cuộc thi & bảng xếp hạng' },
  { href: '/student/discussions', icon: <MessageOutlined />, label: 'Thảo luận' },
  { href: '/student/notifications', icon: <BellOutlined />, label: 'Thông báo' },
  { href: '/student/account', icon: <UserOutlined />, label: 'Tài khoản & mật khẩu' },
];

export default function StudentMorePage() {
  const { me, logout } = useAuth();
  const { student } = useStudent();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small">
        <Typography.Text strong>{me!.fullName}</Typography.Text>
        <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
          <Descriptions.Item label="Mã học sinh">{student?.code ?? me!.username}</Descriptions.Item>
          <Descriptions.Item label="Lớp">{student?.class ? `${student.class.name} · GVCN ${student.class.homeroomTeacher?.fullName ?? '—'}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Năm học">{student?.academicYear?.name ?? '—'}</Descriptions.Item>
          {student?.gender && <Descriptions.Item label="Giới tính">{GENDER[student.gender]}</Descriptions.Item>}
        </Descriptions>
      </Card>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <List
          dataSource={ITEMS}
          renderItem={(i) => (
            <Link href={i.href}>
              <List.Item style={{ padding: '12px 16px' }} extra={<RightOutlined style={{ color: '#9ca3af' }} />}>
                <span style={{ color: '#1d4ed8', fontSize: 18, marginRight: 12 }}>{i.icon}</span>
                <span style={{ color: '#1f2937' }}>{i.label}</span>
              </List.Item>
            </Link>
          )}
        />
      </Card>
      <Button danger block icon={<LogoutOutlined />} onClick={logout}>
        Đăng xuất
      </Button>
    </div>
  );
}

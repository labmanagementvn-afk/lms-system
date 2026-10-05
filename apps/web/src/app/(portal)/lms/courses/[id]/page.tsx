'use client';

import { ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Descriptions, Popconfirm, Space, Spin, Tabs, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { ContentTab } from '@/components/lms/ContentTab';
import { CourseForm } from '@/components/lms/CourseForm';
import { LiveScheduleModal } from '@/components/lms/LiveScheduleModal';
import { LiveSessionsTable } from '@/components/lms/LiveSessionsTable';
import { StudentsTab } from '@/components/lms/StudentsTab';
import { ThreadView } from '@/components/lms/ThreadView';
import { api, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { COURSE_STATUS } from '@/lib/labels';

/** The course builder: outline, enrolled students, discussion board and live rooms. */
export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const router = useRouter();
  const tz = me!.school.timezone;
  const { data: course, error, isLoading, mutate } = useSWR<any>([`/lms/courses/${id}`]);
  const live = useSWR<any[]>(['/lms/live', { courseId: id }]);
  const { data: classes } = useClasses();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !course) return <Alert type="error" message={error?.message ?? 'Không tìm thấy khóa học'} />;

  async function act(fn: () => Promise<any>, ok: (r: any) => string) {
    try {
      const r = await fn();
      message.success(ok(r));
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function publish() {
    modal.confirm({
      title: 'Mở khóa học?',
      content: course.classIds.length
        ? `Học sinh của ${course.classIds.length} lớp sẽ được ghi danh và nhận thông báo.`
        : 'Khóa học chưa chọn lớp: toàn bộ học sinh đang học của trường sẽ được ghi danh và nhận thông báo.',
      okText: 'Mở khóa học',
      cancelText: 'Hủy',
      onOk: () => act(() => api(`/lms/courses/${id}/publish`, { method: 'POST' }), (r) => `Đã mở khóa học, ghi danh thêm ${r.enrolled} học sinh`),
    });
  }

  const status = COURSE_STATUS[course.status];
  const className = (cid: string) => classes?.find((c) => c.id === cid)?.name ?? '?';
  const lessons = [...course.sections.flatMap((s: any) => s.lessons), ...course.unsectioned].map((l: any) => ({ id: l.id, title: l.title }));

  return (
    <>
      <Link href="/lms/courses">
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }}>
          Khóa học
        </Button>
      </Link>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {course.coverFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(course.coverFileId)} alt="" style={{ width: 200, height: 112, objectFit: 'cover', borderRadius: 6 }} />
          )}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Space align="center" wrap style={{ marginBottom: 8 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {course.title}
              </Typography.Title>
              <Tag color={status?.color}>{status?.label ?? course.status}</Tag>
            </Space>
            <Descriptions size="small" column={{ xs: 1, md: 3 }}>
              <Descriptions.Item label="Giáo viên">{course.teacher?.fullName}</Descriptions.Item>
              <Descriptions.Item label="Môn / khối">{[course.subject?.name, course.gradeLevel ? `Khối ${course.gradeLevel}` : null].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
              <Descriptions.Item label="Lớp">{course.classIds.length ? course.classIds.map(className).join(', ') : 'Toàn trường'}</Descriptions.Item>
              <Descriptions.Item label="Bài học">{course.lessonCount}</Descriptions.Item>
              <Descriptions.Item label="Học sinh">{course.enrollmentCount}</Descriptions.Item>
              <Descriptions.Item label="Năm học">{course.academicYear?.name ?? '—'}</Descriptions.Item>
            </Descriptions>
            {course.description && <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>{course.description}</Typography.Paragraph>}
          </div>
          <Space direction="vertical">
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)} block>
              Sửa thông tin
            </Button>
            {course.status !== 'PUBLISHED' && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={publish} block>
                Mở khóa học
              </Button>
            )}
            {course.status === 'PUBLISHED' && (
              <Popconfirm title="Lưu trữ khóa học? Học sinh đã tham gia vẫn xem được." okText="Lưu trữ" cancelText="Hủy" onConfirm={() => act(() => api(`/lms/courses/${id}/archive`, { method: 'POST' }), () => 'Đã lưu trữ khóa học')}>
                <Button icon={<InboxOutlined />} block>
                  Lưu trữ
                </Button>
              </Popconfirm>
            )}
            {course.status === 'DRAFT' && (
              <Popconfirm
                title="Xóa khóa học nháp này?"
                okText="Xóa"
                cancelText="Hủy"
                onConfirm={async () => {
                  try {
                    await api(`/lms/courses/${id}`, { method: 'DELETE' });
                    message.success('Đã xóa khóa học');
                    router.replace('/lms/courses');
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                <Button danger icon={<DeleteOutlined />} block>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      </Card>
      <Tabs
        items={[
          { key: 'content', label: `Nội dung (${course.lessonCount})`, children: <ContentTab course={course} onChanged={() => mutate()} /> },
          { key: 'students', label: `Học sinh (${course.enrollmentCount})`, children: <StudentsTab courseId={id} tz={tz} /> },
          { key: 'threads', label: 'Thảo luận', children: <ThreadView courseId={id} base="/lms" canModerate tz={tz} lessons={lessons} /> },
          {
            key: 'live',
            label: 'Lớp trực tuyến',
            children: (
              <>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setScheduling(true)} style={{ marginBottom: 12 }}>
                  Lên lịch buổi học
                </Button>
                <LiveSessionsTable sessions={live.data} loading={live.isLoading} tz={tz} onChanged={() => live.mutate()} />
              </>
            ),
          },
        ]}
      />
      <CourseForm open={editing} initial={course} onClose={() => setEditing(false)} onSaved={() => mutate()} />
      <LiveScheduleModal open={scheduling} courseId={id} onClose={() => setScheduling(false)} onSaved={() => live.mutate()} />
    </>
  );
}

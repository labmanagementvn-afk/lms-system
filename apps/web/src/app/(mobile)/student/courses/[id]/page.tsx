'use client';

import { ArrowLeftOutlined, MessageOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Alert, Button, Card, List, Progress, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { countdown, formatDateTime } from '@/components/lms/format';
import { LessonTypeIcon } from '@/components/lms/LessonTypeIcon';
import { useAuth } from '@/lib/auth';
import { LESSON_TYPE, LIVE_STATUS, PROGRESS_STATUS } from '@/lib/labels';

type Lesson = { id: string; title: string; type: string; durationMin: number | null; isRequired: boolean; progress: { status: string } | null };

/** A course for the student: outline with per-lesson status, upcoming live rooms, link to the board. */
export default function StudentCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const tz = useAuth().me!.school.timezone;
  const { data: c, error, isLoading } = useSWR<any>([`/student/courses/${id}`]);

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !c) return <Alert type="error" message={error?.message ?? 'Không tìm thấy khóa học'} />;

  const groups: { key: string; title: string; lessons: Lesson[] }[] = [
    ...c.sections.map((s: any) => ({ key: s.id, title: s.title, lessons: s.lessons })),
    ...(c.unsectioned.length ? [{ key: 'none', title: 'Bài học khác', lessons: c.unsectioned }] : []),
  ];
  let n = 0;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href="/student">
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }}>
          Khóa học của tôi
        </Button>
      </Link>
      <Card size="small">
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          {c.title}
        </Typography.Title>
        <Typography.Text type="secondary">{[c.subject?.name, c.gradeLevel ? `Khối ${c.gradeLevel}` : null, c.teacher ? `GV ${c.teacher.fullName}` : null].filter(Boolean).join(' · ')}</Typography.Text>
        <Progress percent={c.progressPct} style={{ marginTop: 8 }} />
        {c.completedAt && <Tag color="green">Hoàn thành {formatDateTime(c.completedAt, tz)}</Tag>}
        {c.description && <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>{c.description}</Typography.Paragraph>}
        <Link href={`/student/discussions?courseId=${c.id}`}>
          <Button icon={<MessageOutlined />} size="small" style={{ marginTop: 8 }}>
            Thảo luận khóa học
          </Button>
        </Link>
      </Card>
      {!!c.liveSessions.length && (
        <Card size="small" title="Lớp học trực tuyến sắp tới" styles={{ body: { padding: '0 12px' } }}>
          <List
            dataSource={c.liveSessions}
            renderItem={(s: any) => (
              <List.Item
                extra={
                  <Link href="/student/live">
                    <Button size="small" type={s.status === 'LIVE' ? 'primary' : 'default'} icon={<VideoCameraOutlined />}>
                      {s.status === 'LIVE' ? 'Vào lớp' : 'Chi tiết'}
                    </Button>
                  </Link>
                }
              >
                <List.Item.Meta
                  title={
                    <>
                      <Tag color={LIVE_STATUS[s.status]?.color}>{LIVE_STATUS[s.status]?.label}</Tag>
                      {s.title}
                    </>
                  }
                  description={`${formatDateTime(s.startsAt, tz)} · ${s.durationMin} phút · ${countdown(s.startsAt)}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
      {groups.map((g) => (
        <Card key={g.key} size="small" title={g.title} styles={{ body: { padding: '0 12px' } }}>
          <List
            dataSource={g.lessons}
            renderItem={(l) => {
              n++;
              const st = PROGRESS_STATUS[l.progress?.status ?? 'NOT_STARTED'];
              return (
                <List.Item extra={<Tag color={st.color}>{st.label}</Tag>} style={{ cursor: 'pointer' }} onClick={() => router.push(`/student/lessons/${l.id}`)}>
                  <List.Item.Meta
                    avatar={<LessonTypeIcon type={l.type} size={22} />}
                    title={
                      <Link href={`/student/lessons/${l.id}`} style={{ color: '#1f2937' }}>
                        {n}. {l.title}
                      </Link>
                    }
                    description={[LESSON_TYPE[l.type], l.durationMin ? `${l.durationMin} phút` : null, l.isRequired ? null : 'tự chọn'].filter(Boolean).join(' · ')}
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      ))}
    </div>
  );
}

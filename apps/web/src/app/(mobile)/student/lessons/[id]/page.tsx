'use client';

import { ArrowLeftOutlined, CheckCircleOutlined, LeftOutlined, MessageOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Space, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { LessonPlayer, PlayableLesson } from '@/components/lms/LessonPlayer';
import { LessonTypeIcon } from '@/components/lms/LessonTypeIcon';
import { ScormData } from '@/components/lms/ScormFrame';
import { formatDuration } from '@/components/lms/format';
import { API_URL, api, getToken } from '@/lib/api';
import { LESSON_TYPE, PROGRESS_STATUS } from '@/lib/labels';
import { useStudent } from '@/lib/student';

type LessonView = PlayableLesson & {
  durationMin: number | null;
  course: { id: string; title: string };
  progress: { status: string; secondsSpent: number; completedAt: string | null; scormData: ScormData | null } | null;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
};

const TICK_MS = 60_000;

/** Sends progress; `keepalive` lets the final report survive the page being left. */
function postProgress(lessonId: string, body: Record<string, unknown>, keepalive = false) {
  return fetch(`${API_URL}/student/lessons/${lessonId}/progress`, {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
    body: JSON.stringify(body),
  });
}

/** The lesson player with a time-spent timer, completion button and previous / next navigation. */
export default function StudentLessonPage() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const { student } = useStudent();
  const { data: lesson, error, isLoading, mutate } = useSWR<LessonView>([`/student/lessons/${id}`]);
  const [completing, setCompleting] = useState(false);
  const since = useRef(Date.now());

  // Mark the lesson opened, then report time spent every minute and when leaving.
  useEffect(() => {
    since.current = Date.now();
    postProgress(id, {}).then(() => mutate(), () => undefined);
    const flush = (keepalive: boolean) => {
      const seconds = Math.round((Date.now() - since.current) / 1000);
      since.current = Date.now();
      if (seconds > 0) postProgress(id, { secondsSpent: Math.min(seconds, 86_400) }, keepalive).catch(() => undefined);
    };
    const timer = setInterval(() => flush(false), TICK_MS);
    const onHide = () => document.visibilityState === 'hidden' && flush(true);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      flush(true);
    };
  }, [id, mutate]);

  const complete = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      setCompleting(true);
      try {
        const seconds = Math.round((Date.now() - since.current) / 1000);
        since.current = Date.now();
        await api(`/student/lessons/${id}/progress`, { method: 'POST', body: { status: 'COMPLETED', secondsSpent: seconds, ...extra } });
        message.success('Đã hoàn thành bài học');
        mutate();
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setCompleting(false);
      }
    },
    [id, message, mutate],
  );

  const onScormCommit = useCallback(
    (data: ScormData, completed: boolean) => {
      if (completed && lesson?.progress?.status !== 'COMPLETED') complete({ scormData: data });
      else postProgress(id, { scormData: data }).catch(() => undefined);
    },
    [id, lesson?.progress?.status, complete],
  );

  if (isLoading || !student) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (error || !lesson) return <Alert type="error" message={error?.message ?? 'Không tìm thấy bài học'} />;

  const done = lesson.progress?.status === 'COMPLETED';
  const st = PROGRESS_STATUS[lesson.progress?.status ?? 'NOT_STARTED'];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href={`/student/courses/${lesson.course.id}`}>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }}>
          {lesson.course.title}
        </Button>
      </Link>
      <Card size="small">
        <Space align="start" style={{ marginBottom: 8 }}>
          <LessonTypeIcon type={lesson.type} size={24} />
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {lesson.title}
            </Typography.Title>
            <Typography.Text type="secondary">
              {LESSON_TYPE[lesson.type]}
              {lesson.durationMin ? ` · ${lesson.durationMin} phút` : ''}
              {lesson.progress ? ` · đã học ${formatDuration(lesson.progress.secondsSpent)}` : ''}
            </Typography.Text>{' '}
            <Tag color={st.color}>{st.label}</Tag>
          </div>
        </Space>
        <LessonPlayer lesson={lesson} student={student} scormData={lesson.progress?.scormData} onScormCommit={onScormCommit} />
      </Card>
      <Space wrap style={{ justifyContent: 'space-between' }}>
        <Space wrap>
          {lesson.previous ? (
            <Link href={`/student/lessons/${lesson.previous.id}`}>
              <Button icon={<LeftOutlined />}>Bài trước</Button>
            </Link>
          ) : (
            <Button icon={<LeftOutlined />} disabled>
              Bài trước
            </Button>
          )}
          {lesson.next ? (
            <Link href={`/student/lessons/${lesson.next.id}`}>
              <Button>
                Bài tiếp <RightOutlined />
              </Button>
            </Link>
          ) : (
            <Button disabled>
              Bài tiếp <RightOutlined />
            </Button>
          )}
          <Link href={`/student/discussions?courseId=${lesson.course.id}&lessonId=${lesson.id}`}>
            <Button type="link" icon={<MessageOutlined />}>
              Thảo luận bài này
            </Button>
          </Link>
        </Space>
        {!done && lesson.type !== 'QUIZ' && (
          <Button type="primary" icon={<CheckCircleOutlined />} loading={completing} onClick={() => complete()}>
            Đánh dấu hoàn thành
          </Button>
        )}
        {!done && lesson.type === 'QUIZ' && <Typography.Text type="secondary">Bài học hoàn thành khi bạn nộp bài kiểm tra.</Typography.Text>}
      </Space>
    </div>
  );
}

'use client';

import { Empty, Select, Spin, Typography } from 'antd';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { ThreadView } from '@/components/lms/ThreadView';
import { useAuth } from '@/lib/auth';

export default function StudentDiscussionsPage() {
  return (
    <Suspense>
      <Discussions />
    </Suspense>
  );
}

/** Boards of the courses I am enrolled in; ?courseId= preselects one, ?lessonId= prefills a new thread. */
function Discussions() {
  const params = useSearchParams();
  const tz = useAuth().me!.school.timezone;
  const { data, isLoading } = useSWR<{ enrolled: any[] }>(['/student/courses']);
  const [courseId, setCourseId] = useState<string | undefined>(params.get('courseId') ?? undefined);
  const lessonId = params.get('lessonId') ?? undefined;
  const course = useSWR<any>(courseId ? [`/student/courses/${courseId}`] : null);

  useEffect(() => {
    if (!courseId && data?.enrolled.length) setCourseId(data.enrolled[0].id);
  }, [data, courseId]);

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!data?.enrolled.length) return <Empty description="Bạn chưa tham gia khóa học nào" style={{ marginTop: 48 }} />;
  const lessons = course.data ? [...course.data.sections.flatMap((s: any) => s.lessons), ...course.data.unsectioned].map((l: any) => ({ id: l.id, title: l.title })) : undefined;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text strong>Thảo luận</Typography.Text>
        <Select style={{ minWidth: 240, flex: 1, maxWidth: 420 }} value={courseId} onChange={setCourseId} options={data.enrolled.map((c) => ({ value: c.id, label: c.title }))} />
      </div>
      {courseId && <ThreadView key={courseId} courseId={courseId} base="/student" canModerate={false} tz={tz} lessons={lessons} initialLessonId={lessonId} />}
    </div>
  );
}

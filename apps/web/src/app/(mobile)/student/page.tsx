'use client';

import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Empty, Spin, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { CourseCard, CourseSummary } from '@/components/lms/CourseCard';
import { api } from '@/lib/api';

type Enrolled = CourseSummary & { progressPct: number; completedAt: string | null; nextLesson: { id: string; title: string; type: string } | null };

/** Student home: my courses with a "continue" button, and open courses to join. */
export default function StudentHomePage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ enrolled: Enrolled[]; available: CourseSummary[] }>(['/student/courses']);
  const [joining, setJoining] = useState<string | null>(null);

  async function enrol(id: string) {
    setJoining(id);
    try {
      await api(`/student/courses/${id}/enrol`, { method: 'POST' });
      message.success('Đã tham gia khóa học');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setJoining(null);
    }
  }

  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <Typography.Title level={5} style={{ margin: '4px 0 12px' }}>
          Khóa học của tôi
        </Typography.Title>
        {!data?.enrolled.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa tham gia khóa học nào" />
        ) : (
          <div style={grid}>
            {data.enrolled.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                onClick={() => router.push(`/student/courses/${c.id}`)}
                extra={
                  <Button
                    type={c.completedAt ? 'default' : 'primary'}
                    size="small"
                    block
                    icon={<PlayCircleOutlined />}
                    style={{ marginTop: 8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(c.nextLesson ? `/student/lessons/${c.nextLesson.id}` : `/student/courses/${c.id}`);
                    }}
                  >
                    {c.completedAt ? 'Xem lại' : c.progressPct ? 'Tiếp tục' : 'Bắt đầu học'}
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>
      {!!data?.available.length && (
        <section>
          <Typography.Title level={5} style={{ margin: '4px 0 12px' }}>
            Khóa học có thể tham gia
          </Typography.Title>
          <div style={grid}>
            {data.available.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                extra={
                  <Button size="small" block icon={<PlusOutlined />} style={{ marginTop: 8 }} loading={joining === c.id} onClick={() => enrol(c.id)}>
                    Tham gia
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

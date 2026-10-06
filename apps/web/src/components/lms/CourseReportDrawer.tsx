'use client';

import { Drawer, Progress, Table, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { LESSON_TYPE } from '@/lib/labels';
import { formatDateTime, formatDuration } from './format';
import { LessonTypeIcon } from './LessonTypeIcon';

type LessonRow = { id: string; title: string; type: string; isRequired: boolean; completed: number; inProgress: number; notStarted: number; avgSeconds: number };
type StudentRow = { student: { id: string; code: string; fullName: string; class: { name: string } | null }; progressPct: number; completedAt: string | null; secondsSpent: number; lessonsCompleted: number; lastAt: string | null };

/** Per-lesson completion and per-student progress of one course. */
export function CourseReportDrawer({ courseId, tz, onClose }: { courseId: string | null; tz: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<{ course: { title: string }; lessonCount: number; lessons: LessonRow[]; students: StudentRow[] }>(courseId ? [`/lms/reports/courses/${courseId}`] : null);
  const total = data?.students.length ?? 0;
  return (
    <Drawer open={!!courseId} onClose={onClose} width={960} title={data?.course.title ?? 'Báo cáo khóa học'} loading={isLoading}>
      <Typography.Title level={5}>Hoàn thành theo bài học</Typography.Title>
      <Table<LessonRow>
        rowKey="id"
        size="small"
        dataSource={data?.lessons}
        pagination={false}
        columns={[
          {
            title: 'Bài học',
            render: (_, l) => (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <LessonTypeIcon type={l.type} /> {l.title} {!l.isRequired && <Tag>Tự chọn</Tag>}
              </span>
            ),
          },
          { title: 'Loại', width: 110, render: (_, l) => LESSON_TYPE[l.type] },
          {
            title: 'Tiến độ',
            width: 260,
            render: (_, l) => (
              <Progress
                size="small"
                percent={total ? Math.round(((l.completed + l.inProgress) / total) * 100) : 0}
                success={{ percent: total ? Math.round((l.completed / total) * 100) : 0 }}
                format={() => `${l.completed} xong · ${l.inProgress} đang học · ${l.notStarted} chưa`}
              />
            ),
          },
          { title: 'TB thời gian', width: 120, render: (_, l) => formatDuration(l.avgSeconds) },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Tiến độ từng học sinh
      </Typography.Title>
      <Table<StudentRow>
        rowKey={(r) => r.student.id}
        size="small"
        dataSource={data?.students}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={[
          { title: 'Mã HS', width: 110, render: (_, r) => r.student.code },
          { title: 'Họ và tên', render: (_, r) => r.student.fullName },
          { title: 'Lớp', width: 70, render: (_, r) => r.student.class?.name ?? '' },
          { title: 'Tiến độ', width: 200, sorter: (a, b) => a.progressPct - b.progressPct, render: (_, r) => <Progress size="small" percent={r.progressPct} format={() => `${r.progressPct}% · ${r.lessonsCompleted}/${data?.lessonCount ?? 0}`} /> },
          { title: 'Thời gian học', width: 120, sorter: (a, b) => a.secondsSpent - b.secondsSpent, render: (_, r) => formatDuration(r.secondsSpent) },
          { title: 'Hoạt động cuối', width: 150, render: (_, r) => formatDateTime(r.lastAt, tz) },
          { title: 'Hoàn thành', width: 150, render: (_, r) => formatDateTime(r.completedAt, tz) },
        ]}
      />
    </Drawer>
  );
}

'use client';

import { ReadOutlined } from '@ant-design/icons';
import { Card, Progress, Tag, Typography } from 'antd';
import { ReactNode } from 'react';
import { fileUrl } from '@/lib/api';
import { COURSE_STATUS } from '@/lib/labels';

export interface CourseSummary {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  gradeLevel?: number | null;
  coverFileId?: string | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string } | null;
  lessonCount?: number;
  enrollmentCount?: number;
  progressPct?: number;
}

/** Course tile with cover, subject / grade, teacher and either a progress bar (student) or counts (portal). */
export function CourseCard({ course, onClick, actions, extra }: { course: CourseSummary; onClick?: () => void; actions?: ReactNode[]; extra?: ReactNode }) {
  const status = COURSE_STATUS[course.status];
  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={onClick}
      actions={actions}
      cover={
        <div style={{ height: 120, background: '#e0e7ff', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {course.coverFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(course.coverFileId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <ReadOutlined style={{ fontSize: 40, color: '#4f46e5' }} />
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <Typography.Text strong ellipsis={{ tooltip: course.title }} style={{ flex: 1 }}>
          {course.title}
        </Typography.Text>
        {status && course.status !== 'PUBLISHED' && <Tag color={status.color}>{status.label}</Tag>}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {[course.subject?.name, course.gradeLevel ? `Khối ${course.gradeLevel}` : null, course.teacher?.fullName].filter(Boolean).join(' · ') || '—'}
      </div>
      {course.progressPct !== undefined ? (
        <Progress percent={course.progressPct} size="small" style={{ marginTop: 8 }} />
      ) : (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          {course.lessonCount ?? 0} bài học · {course.enrollmentCount ?? 0} học sinh
        </div>
      )}
      {extra}
    </Card>
  );
}

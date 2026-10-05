'use client';

import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { CourseReportDrawer } from '@/components/lms/CourseReportDrawer';
import { LessonTypeIcon } from '@/components/lms/LessonTypeIcon';
import { useAuth } from '@/lib/auth';
import { COURSE_STATUS, LESSON_TYPE } from '@/lib/labels';

type Overview = {
  courses: { total: number; published: number; draft: number; archived: number };
  enrollments: number;
  completionRate: number;
  activeStudents7d: number;
  lessonsByType: Record<string, number>;
  liveSessions: { upcoming: number; ended: number };
};

/** School-wide learning numbers and a per-course drill-down. */
export default function LmsReportsPage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { data: o } = useSWR<Overview>(['/lms/reports/overview']);
  const { data: courses, isLoading } = useSWR<{ items: any[] }>(['/lms/courses', { pageSize: 100 }]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const lessonTotal = Object.values(o?.lessonsByType ?? {}).reduce((s, n) => s + n, 0);

  const stat = (title: string, value: number | undefined, suffix?: string, color?: string) => (
    <Col xs={12} md={8} lg={4}>
      <Card size="small">
        <Statistic title={title} value={value ?? 0} suffix={suffix} valueStyle={color ? { color } : undefined} />
      </Card>
    </Col>
  );

  return (
    <>
      <PageHeader title="Báo cáo học tập" />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {stat('Khóa học đang mở', o?.courses.published, o ? `/ ${o.courses.total}` : undefined, '#16a34a')}
        {stat('Khóa học nháp', o?.courses.draft)}
        {stat('Lượt ghi danh', o?.enrollments)}
        {stat('Tỷ lệ hoàn thành', o?.completionRate, '%', '#1677ff')}
        {stat('Học sinh học 7 ngày qua', o?.activeStudents7d, undefined, '#7c3aed')}
        {stat('Lớp trực tuyến', o?.liveSessions.ended, o ? `đã diễn ra · ${o.liveSessions.upcoming} sắp tới` : undefined)}
      </Row>
      <Card size="small" title={`Bài học theo loại (${lessonTotal})`} style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          {Object.entries(LESSON_TYPE).map(([type, label]) => {
            const n = o?.lessonsByType[type] ?? 0;
            return (
              <Col xs={12} md={8} lg={6} xl={3} key={type}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <LessonTypeIcon type={type} size={18} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
                    <Progress percent={lessonTotal ? Math.round((n / lessonTotal) * 100) : 0} size="small" format={() => n} />
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>
      <Typography.Title level={5}>Theo khóa học</Typography.Title>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={courses?.items}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        onRow={(c) => ({ onClick: () => setCourseId(c.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Khóa học', render: (_, c) => <Typography.Link>{c.title}</Typography.Link> },
          { title: 'Trạng thái', width: 120, render: (_, c) => <Tag color={COURSE_STATUS[c.status]?.color}>{COURSE_STATUS[c.status]?.label}</Tag> },
          { title: 'Giáo viên', width: 180, render: (_, c) => c.teacher?.fullName },
          { title: 'Môn', width: 150, render: (_, c) => c.subject?.name ?? '' },
          { title: 'Bài học', width: 90, align: 'right', dataIndex: 'lessonCount' },
          { title: 'Học sinh', width: 90, align: 'right', dataIndex: 'enrollmentCount' },
        ]}
      />
      <CourseReportDrawer courseId={courseId} tz={tz} onClose={() => setCourseId(null)} />
    </>
  );
}

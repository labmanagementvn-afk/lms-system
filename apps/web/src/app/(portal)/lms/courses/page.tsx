'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Select, Space, Table, Tag } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { CourseForm } from '@/components/lms/CourseForm';
import { formatDateTime } from '@/components/lms/format';
import { useAuth } from '@/lib/auth';
import { useAllTeachers, useSubjects } from '@/lib/hooks';
import { COURSE_STATUS } from '@/lib/labels';

const PAGE_SIZE = 20;

export default function CoursesPage() {
  const { me } = useAuth();
  const router = useRouter();
  const tz = me!.school.timezone;
  const isTeacher = me?.role === 'TEACHER';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [teacherId, setTeacherId] = useState<string>();
  const [mine, setMine] = useState(isTeacher);
  const [creating, setCreating] = useState(false);
  const { data: subjects } = useSubjects();
  const { data: teachers } = useAllTeachers();
  const { data, isLoading, mutate } = useSWR<any>(['/lms/courses', { page, pageSize: PAGE_SIZE, q: q || undefined, status, subjectId, gradeLevel, teacherId, mine: mine ? 'true' : undefined }]);

  const reset = () => setPage(1);
  return (
    <>
      <PageHeader
        title="Khóa học"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Tạo khóa học
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tên" allowClear style={{ width: 220 }} onSearch={(v) => (setQ(v), reset())} />
        <Select placeholder="Trạng thái" allowClear style={{ width: 140 }} value={status} onChange={(v) => (setStatus(v), reset())} options={Object.entries(COURSE_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Select placeholder="Môn học" allowClear style={{ width: 170 }} value={subjectId} onChange={(v) => (setSubjectId(v), reset())} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select placeholder="Khối" allowClear style={{ width: 100 }} value={gradeLevel} onChange={(v) => (setGradeLevel(v), reset())} options={[6, 7, 8, 9].map((g) => ({ value: g, label: `Khối ${g}` }))} />
        {!isTeacher && (
          <Select
            placeholder="Giáo viên"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 220 }}
            value={teacherId}
            onChange={(v) => (setTeacherId(v), reset())}
            options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: t.fullName }))}
          />
        )}
        {isTeacher && (
          <Checkbox checked={mine} onChange={(e) => (setMine(e.target.checked), reset())}>
            Chỉ khóa học của tôi
          </Checkbox>
        )}
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: 'Khóa học',
            render: (_, c) => (
              <Link href={`/lms/courses/${c.id}`}>
                <b>{c.title}</b>
              </Link>
            ),
          },
          { title: 'Trạng thái', width: 120, render: (_, c) => <Tag color={COURSE_STATUS[c.status]?.color}>{COURSE_STATUS[c.status]?.label ?? c.status}</Tag> },
          { title: 'Môn', width: 150, render: (_, c) => c.subject?.name ?? '' },
          { title: 'Khối', width: 70, render: (_, c) => c.gradeLevel ?? '' },
          { title: 'Giáo viên', width: 180, render: (_, c) => c.teacher?.fullName },
          { title: 'Lớp', width: 160, render: (_, c) => (c.classIds.length ? `${c.classIds.length} lớp` : 'Toàn trường') },
          { title: 'Bài học', width: 90, align: 'right', dataIndex: 'lessonCount' },
          { title: 'Học sinh', width: 90, align: 'right', dataIndex: 'enrollmentCount' },
          { title: 'Cập nhật', width: 150, render: (_, c) => formatDateTime(c.updatedAt, tz) },
        ]}
      />
      <CourseForm
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={(c) => {
          mutate();
          router.push(`/lms/courses/${c.id}`);
        }}
      />
    </>
  );
}

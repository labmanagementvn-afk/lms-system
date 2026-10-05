'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Badge, Button, Input, Select, Space, Table, Tag } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { KIND_COLOR } from '@/components/assessments/model';
import { TestForm } from '@/components/assessments/TestForm';
import { formatDateTime } from '@/components/lms/format';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth';
import { useSubjects } from '@/lib/hooks';
import { options, TEST_KIND, TEST_STATUS } from '@/lib/labels';

const PAGE_SIZE = 20;

/** Bài kiểm tra, bài thi và cuộc thi of the school with their grading backlog. */
export default function TestsPage() {
  const { me } = useAuth();
  const router = useRouter();
  const tz = me!.school.timezone;
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [creating, setCreating] = useState(false);
  const { data: subjects } = useSubjects();
  const { data, isLoading, mutate } = useSWR<any>(['/lms/tests', { page, pageSize: PAGE_SIZE, q: q || undefined, kind, status, subjectId, gradeLevel }]);
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader
        title="Bài kiểm tra & cuộc thi"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Tạo bài kiểm tra
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo tiêu đề" allowClear style={{ width: 220 }} onSearch={(v) => (setQ(v), reset())} />
        <Select placeholder="Loại" allowClear style={{ width: 140 }} value={kind} onChange={(v) => (setKind(v), reset())} options={options(TEST_KIND)} />
        <Select placeholder="Trạng thái" allowClear style={{ width: 130 }} value={status} onChange={(v) => (setStatus(v), reset())} options={Object.entries(TEST_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Select placeholder="Môn học" allowClear style={{ width: 160 }} value={subjectId} onChange={(v) => (setSubjectId(v), reset())} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select placeholder="Khối" allowClear style={{ width: 100 }} value={gradeLevel} onChange={(v) => (setGradeLevel(v), reset())} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1100 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: 'Bài kiểm tra',
            render: (_, t) => (
              <Space direction="vertical" size={0}>
                <Link href={`/lms/tests/${t.id}`}>
                  <b>{t.title}</b>
                </Link>
                {t.course && <span style={{ fontSize: 12, color: '#6b7280' }}>Khóa học: {t.course.title}</span>}
              </Space>
            ),
          },
          { title: 'Loại', width: 120, render: (_, t) => <Tag color={KIND_COLOR[t.kind]}>{TEST_KIND[t.kind] ?? t.kind}</Tag> },
          { title: 'Trạng thái', width: 110, render: (_, t) => <Tag color={TEST_STATUS[t.status]?.color}>{TEST_STATUS[t.status]?.label ?? t.status}</Tag> },
          { title: 'Môn', width: 120, render: (_, t) => t.subject?.name ?? '' },
          { title: 'Khối', width: 60, render: (_, t) => t.gradeLevel ?? '' },
          { title: 'Số câu', width: 80, align: 'right', dataIndex: 'questionCount' },
          { title: 'Thời gian', width: 100, render: (_, t) => (t.timeLimitMin ? `${t.timeLimitMin} phút` : 'Không giới hạn') },
          { title: 'Hạn nộp', width: 150, render: (_, t) => (t.closeAt ? formatDateTime(t.closeAt, tz) : '') },
          {
            title: 'Bài làm',
            width: 140,
            render: (_, t) => (
              <Space size={6}>
                <span>{t.attemptCount}</span>
                {t.needsGrading > 0 && <Badge color="orange" text={`${t.needsGrading} chờ chấm`} />}
              </Space>
            ),
          },
        ]}
      />
      <TestForm
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={(t) => {
          mutate();
          router.push(`/lms/tests/${t.id}`);
        }}
      />
    </>
  );
}

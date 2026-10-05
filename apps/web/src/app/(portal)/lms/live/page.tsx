'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Select, Space } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { LiveScheduleModal } from '@/components/lms/LiveScheduleModal';
import { LiveSession, LiveSessionsTable } from '@/components/lms/LiveSessionsTable';
import { useAuth } from '@/lib/auth';

/** Every live room of the school: running first, then upcoming, then past. */
export default function LivePage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const [courseId, setCourseId] = useState<string>();
  const [scheduling, setScheduling] = useState(false);
  const { data, isLoading, mutate } = useSWR<LiveSession[]>(['/lms/live', { courseId }]);
  const { data: courses } = useSWR<{ items: any[] }>(['/lms/courses', { pageSize: 100 }]);

  return (
    <>
      <PageHeader
        title="Lớp học trực tuyến"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setScheduling(true)}>
            Lên lịch buổi học
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder="Tất cả khóa học" allowClear showSearch optionFilterProp="label" style={{ width: 300 }} value={courseId} onChange={setCourseId} options={(courses?.items ?? []).map((c) => ({ value: c.id, label: c.title }))} />
      </Space>
      <LiveSessionsTable sessions={data} loading={isLoading} tz={tz} showCourse onChanged={() => mutate()} />
      <LiveScheduleModal open={scheduling} onClose={() => setScheduling(false)} onSaved={() => mutate()} />
    </>
  );
}

'use client';

import { RightOutlined, TrophyOutlined } from '@ant-design/icons';
import { Card, Empty, Spin, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { StudentTest } from '@/components/assessments/model';
import { StudentTestCard } from '@/components/assessments/student';

/** Tests assigned to me: what is open now first, then what is done or closed. */
export default function StudentTestsPage() {
  const { data, isLoading } = useSWR<StudentTest[]>(['/student/tests']);
  if (isLoading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  const tests = data ?? [];
  const open = tests.filter((t) => t.canStart || t.inProgressAttemptId);
  const rest = tests.filter((t) => !open.includes(t));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Link href="/student/contests">
        <Card size="small" hoverable styles={{ body: { display: 'flex', alignItems: 'center', gap: 12, padding: 12 } }} style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <TrophyOutlined style={{ fontSize: 24, color: '#d97706' }} />
          <div style={{ flex: 1 }}>
            <Typography.Text strong>Cuộc thi & bảng xếp hạng</Typography.Text>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Tham gia các cuộc thi của trường và xem thứ hạng của em</div>
          </div>
          <RightOutlined style={{ color: '#9ca3af' }} />
        </Card>
      </Link>
      <section>
        <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
          Cần làm
        </Typography.Title>
        {open.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {open.map((t) => (
              <StudentTestCard key={t.id} test={t} />
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Em không có bài kiểm tra nào cần làm" />
        )}
      </section>
      {rest.length > 0 && (
        <section>
          <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
            Đã làm hoặc chưa mở
          </Typography.Title>
          <div style={{ display: 'grid', gap: 8 }}>
            {rest.map((t) => (
              <StudentTestCard key={t.id} test={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

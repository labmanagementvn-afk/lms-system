'use client';

import { EditOutlined } from '@ant-design/icons';
import { Empty, Space, Table, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { ReportButtons } from '@/components/grades/control/ReportButtons';
import { PromotionTag, ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { PromotionOverview, Scope } from './types';

type ClassRow = PromotionOverview['classes'][number];
type StudentRow = PromotionOverview['students'][number];

const count = (n: number, color?: string) => (n ? <Typography.Text style={{ color, fontWeight: 600 }}>{n}</Typography.Text> : <Typography.Text type="secondary">0</Typography.Text>);

/** Kết quả xét lên lớp: per class after the summer review, and every student not promoted outright. */
export function PromotionTab({ scope, scopeName }: { scope: Scope; scopeName: string }) {
  const { data, isLoading } = useSWR<PromotionOverview>(['/grades/review/promotion', scope]);
  const gradeName = scope.gradeLevel ? `khoi-${scope.gradeLevel}` : 'toan-truong';

  return (
    <>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'flex-end' }}>
        {/* These two lists cover a grade level or the school. */}
        <ReportButtons label="Danh sách kiểm tra lại, rèn luyện hè" report="promotion" query={{ gradeLevel: scope.gradeLevel, promotion: 'RETEST' }} fileName={`kiem-tra-lai-ren-luyen-he-${gradeName}`} />
        <ReportButtons label="Danh sách ở lại lớp" report="promotion" query={{ gradeLevel: scope.gradeLevel, promotion: 'RETAINED' }} fileName={`o-lai-lop-${gradeName}`} />
        <ReportButtons label="Giấy khen" report="award-certificates" query={scope} fileName={`giay-khen-${scopeName}`} />
      </Space>
      <Table<ClassRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.classes ?? []}
        pagination={false}
        style={{ marginBottom: 16 }}
        columns={[
          { title: 'Lớp', dataIndex: 'name', width: 80 },
          { title: 'Sĩ số', dataIndex: 'students', width: 70, align: 'center' },
          { title: 'Được lên lớp', width: 110, align: 'center', render: (_, c) => count(c.promoted, '#16a34a') },
          { title: 'Lên lớp sau xét lại', width: 140, align: 'center', render: (_, c) => count(c.afterReview, '#2563eb') },
          { title: 'Đang kiểm tra lại, rèn luyện hè', width: 200, align: 'center', render: (_, c) => count(c.retest, '#d97706') },
          { title: 'Ở lại lớp', width: 90, align: 'center', render: (_, c) => count(c.retained, '#dc2626') },
          { title: 'Chưa xét', width: 90, align: 'center', render: (_, c) => count(c.pending) },
        ]}
        locale={{ emptyText: <Empty description="Chưa có lớp" /> }}
      />
      <Typography.Title level={5}>Học sinh không được lên lớp thẳng</Typography.Title>
      <Table<StudentRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.students ?? []}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: '#', width: 44, render: (_, __, i) => i + 1 },
          { title: 'Họ và tên', width: 190, render: (_, s) => <Link href={`/grades/transcript/${s.id}`}>{s.fullName}</Link> },
          { title: 'Lớp', width: 64, align: 'center', render: (_, s) => s.class.name },
          { title: 'Học tập', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.academic} /> },
          { title: 'Rèn luyện', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.conduct} /> },
          { title: 'Nghỉ', width: 60, align: 'center', dataIndex: 'absentDays' },
          { title: 'Sau xét lại', width: 100, align: 'center', render: (_, s) => <ResultLevelTag level={s.academicAfterRetake ?? s.conductAfterTraining} /> },
          {
            title: 'Kết quả',
            width: 150,
            align: 'center',
            render: (_, s) => (
              <Space size={4}>
                <PromotionTag status={s.promotion} review={s.review} />
                {s.promotionSetByHand && (
                  <Tooltip title="Nhà trường quyết định">
                    <EditOutlined style={{ color: '#888' }} />
                  </Tooltip>
                )}
              </Space>
            ),
          },
          { title: 'Lý do', dataIndex: 'reason' },
        ]}
        locale={{ emptyText: <Empty description="Mọi học sinh có kết quả đều được lên lớp" /> }}
      />
    </>
  );
}

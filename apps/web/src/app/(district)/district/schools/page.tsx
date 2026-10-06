'use client';

import { DatePicker, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { SchoolsTable } from '@/components/district/SchoolsTable';
import { PageHeader } from '@/components/PageHeader';

/** Every school of the district with its full daily statistics line. */
export default function DistrictSchoolsPage() {
  const [date, setDate] = useState<string>();
  const { data, isLoading } = useSWR<any>(['/district/overview', { date }]);
  return (
    <>
      <PageHeader
        title="Trường học"
        extra={
          <Space>
            <span>Số liệu ngày</span>
            <DatePicker allowClear={false} format="DD/MM/YYYY" value={dayjs(date ?? data?.date ?? undefined)} disabledDate={(d) => d.isAfter(dayjs(), 'day')} onChange={(d) => setDate(d.format('YYYY-MM-DD'))} />
          </Space>
        }
      />
      <Typography.Paragraph type="secondary">Bấm tên trường để xem chi tiết 14 ngày, lớp học, cảnh báo và đầu mối liên hệ.</Typography.Paragraph>
      <SchoolsTable rows={data?.schools} loading={isLoading} full />
    </>
  );
}

'use client';

import { Tabs } from 'antd';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertEventsTable } from '@/components/alerts/AlertEventsTable';
import { RulesPanel } from '@/components/alerts/RulesPanel';
import { PageHeader } from '@/components/PageHeader';

/** District alerts: events across every school, and the district-wide rules that raise them. */
export default function DistrictAlertsPage() {
  const params = useSearchParams();
  const overview = useSWR<any>(['/district/overview']);
  const schools = (overview.data?.schools ?? []).map((s: any) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader title="Cảnh báo" />
      <Tabs
        defaultActiveKey={params.get('tab') ?? 'events'}
        items={[
          {
            key: 'events',
            label: 'Cảnh báo đã phát sinh',
            children: (
              <AlertEventsTable
                endpoint="/district/alerts"
                ackEndpoint={(id) => `/district/alerts/${id}/ack`}
                canAck
                showSchool
                schoolLink={(id) => `/district/schools/${id}`}
                schools={schools}
                initialSchoolId={params.get('schoolId') ?? undefined}
              />
            ),
          },
          {
            key: 'rules',
            label: 'Quy tắc toàn Phòng/Sở',
            children: <RulesPanel endpoint="/district/rules" canEdit title="Quy tắc của Phòng/Sở áp dụng cho mọi trường trực thuộc, bên cạnh quy tắc riêng của từng trường; được kiểm tra mỗi đêm trên số liệu ngày hôm trước." />,
          },
        ]}
      />
    </>
  );
}

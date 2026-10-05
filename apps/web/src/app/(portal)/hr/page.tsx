'use client';

import { Card, Col, Row, Statistic, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { EmployeeDrawer } from '@/components/hr/EmployeeDrawer';
import { EmployeesTab } from '@/components/hr/EmployeesTab';
import { ExpiringTab } from '@/components/hr/ExpiringTab';
import { LeaveTab } from '@/components/hr/LeaveTab';
import { MyHrPanel } from '@/components/hr/MyHrPanel';
import { useAuth } from '@/lib/auth';

export default function HrPage() {
  const { me } = useAuth();
  if (me?.role === 'TEACHER') {
    return (
      <>
        <PageHeader title="Hồ sơ nhân sự của tôi" />
        <MyHrPanel />
      </>
    );
  }
  return <OfficeHr />;
}

/** Office view: headcount summary, the employee register, leave approvals and expiry alerts. */
function OfficeHr() {
  const { data: summary, mutate } = useSWR<any>(['/hr/summary']);
  const [tab, setTab] = useState('employees');
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Nhân sự" />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Nhân sự hiện có" value={summary?.headcount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Đang làm việc" value={summary?.byStatus?.ACTIVE ?? 0} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Tạm nghỉ" value={summary?.byStatus?.ON_LEAVE ?? 0} valueStyle={{ color: '#d46b08' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small" hoverable onClick={() => setTab('leave')}>
            <Statistic title="Đơn nghỉ chờ duyệt" value={summary?.pendingLeave ?? 0} valueStyle={{ color: summary?.pendingLeave ? '#1677ff' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small" hoverable onClick={() => setTab('expiring')}>
            <Statistic title="Hết hạn trong 30 ngày" value={summary?.expiring?.total ?? 0} valueStyle={{ color: summary?.expiring?.total ? '#cf1322' : undefined }} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={4}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              Theo bộ phận
            </Typography.Text>
            <div style={{ marginTop: 6 }}>
              {summary?.byDepartment?.map((d: any) => (
                <Tag key={d.department} style={{ marginBottom: 4 }}>
                  {d.department}: {d.count}
                </Tag>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'employees',
            label: 'Nhân viên',
            children: <EmployeesTab departments={summary?.byDepartment?.map((d: any) => d.department)} onChanged={() => mutate()} />,
          },
          { key: 'leave', label: 'Nghỉ phép', children: <LeaveTab onChanged={() => mutate()} /> },
          { key: 'expiring', label: 'Sắp hết hạn', children: <ExpiringTab onOpen={setOpenId} /> },
        ]}
      />
      <EmployeeDrawer employeeId={openId} onClose={() => setOpenId(null)} onChanged={() => mutate()} />
    </>
  );
}

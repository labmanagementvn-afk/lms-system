'use client';

import { Card, Col, Row, Statistic, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { AssetsTab } from '@/components/assets/AssetsTab';
import { AuditsTab } from '@/components/assets/AuditsTab';
import { LoansTab } from '@/components/assets/LoansTab';
import { vnd } from '@/lib/labels';

export default function AssetsPage() {
  const { data: summary, mutate } = useSWR<any>(['/assets/summary']);
  const [tab, setTab] = useState('assets');
  const byStatus = summary?.byStatus ?? {};

  return (
    <>
      <PageHeader title="Tài sản" />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Tài sản đang theo dõi" value={summary?.total ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={5}>
          <Card size="small">
            <Statistic title="Tổng nguyên giá" value={summary?.totalPurchaseValue ?? 0} formatter={(v) => vnd(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={5}>
          <Card size="small">
            <Statistic title="Giá trị còn lại" value={summary?.totalBookValue ?? 0} formatter={(v) => vnd(Number(v))} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card size="small">
            <Statistic title="Đang sử dụng" value={byStatus.IN_USE ?? 0} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Card size="small" hoverable onClick={() => setTab('loans')}>
            <Statistic title="Cho mượn" value={byStatus.LENT ?? 0} valueStyle={{ color: byStatus.LENT ? '#1677ff' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Đang sửa chữa" value={byStatus.UNDER_MAINTENANCE ?? 0} valueStyle={{ color: byStatus.UNDER_MAINTENANCE ? '#d46b08' : undefined }} />
          </Card>
        </Col>
        {summary?.byCategory?.length > 0 && (
          <Col span={24}>
            <Card size="small">
              <Typography.Text type="secondary">Theo danh mục: </Typography.Text>
              {summary.byCategory.map((c: any) => (
                <Tag key={c.id} style={{ marginBottom: 4 }}>
                  {c.name}: {c.count} · còn lại {vnd(c.bookValue)}
                </Tag>
              ))}
            </Card>
          </Col>
        )}
      </Row>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'assets', label: 'Tài sản', children: <AssetsTab onChanged={() => mutate()} /> },
          { key: 'loans', label: 'Cho mượn', children: <LoansTab onChanged={() => mutate()} /> },
          { key: 'audits', label: 'Kiểm kê', children: <AuditsTab onChanged={() => mutate()} /> },
        ]}
      />
    </>
  );
}

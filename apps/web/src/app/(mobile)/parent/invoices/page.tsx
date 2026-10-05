'use client';

import { RightOutlined } from '@ant-design/icons';
import { Card, Empty, List, Spin, Statistic, Tag, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { INVOICE_STATUS, vnd } from '@/lib/labels';
import { useParent } from '@/lib/parent';

interface Invoice {
  id: string;
  title: string;
  total: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  issuedAt: string;
  campaign: { name: string } | null;
}

export default function ParentInvoicesPage() {
  const { child, loading } = useParent();
  const { data, isLoading } = useSWR<{ items: Invoice[]; outstanding: number }>(child ? [`/parent/children/${child.id}/invoices`] : null);

  if (loading || (child && isLoading)) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small">
        <Statistic title={`Còn phải nộp · ${child.fullName}`} value={data?.outstanding ?? 0} formatter={(v) => vnd(Number(v))} valueStyle={{ color: data?.outstanding ? '#dc2626' : '#16a34a' }} />
      </Card>
      <List
        dataSource={data?.items ?? []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khoản thu nào" /> }}
        renderItem={(inv) => {
          const st = INVOICE_STATUS[inv.status];
          const remaining = inv.total - inv.paidAmount;
          return (
            <Link href={`/parent/invoices/${inv.id}`}>
              <Card size="small" style={{ marginBottom: 8 }} hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {inv.title}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Phát hành {new Date(inv.issuedAt).toLocaleDateString('vi-VN')}
                      {inv.dueDate ? ` · Hạn ${new Date(inv.dueDate).toLocaleDateString('vi-VN')}` : ''}
                    </Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color={st?.color}>{st?.label ?? inv.status}</Tag>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600 }}>{vnd(inv.total)}</div>
                    {remaining > 0 && inv.status !== 'CARRIED_OVER' && (
                      <Typography.Text type="danger" style={{ fontSize: 12 }}>
                        Còn {vnd(remaining)}
                      </Typography.Text>
                    )}
                    <RightOutlined style={{ marginLeft: 8, color: '#9ca3af' }} />
                  </div>
                </div>
              </Card>
            </Link>
          );
        }}
      />
    </div>
  );
}

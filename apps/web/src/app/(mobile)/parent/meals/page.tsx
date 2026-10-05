'use client';

import { App, Button, Card, DatePicker, Empty, List, Spin, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MEAL_TYPE, vnd } from '@/lib/labels';
import { useParent } from '@/lib/parent';
import { todayIn } from '@/lib/time';

interface Menu {
  id: string;
  date: string;
  mealType: string;
  dishes: string[];
  price: number;
  cutoff: string;
}

export default function ParentMealsPage() {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { child, loading } = useParent();
  const [month, setMonth] = useState<Dayjs>(dayjs(todayIn(tz)));
  const key = child ? [`/parent/children/${child.id}/meals`, { month: month.format('YYYY-MM') }] : null;
  const { data, isLoading, mutate } = useSWR<{ menus: Menu[]; registrations: { date: string; mealType: string }[] }>(key);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  const registered = new Set((data?.registrations ?? []).map((r) => `${r.date}|${r.mealType}`));
  const today = todayIn(tz);

  async function toggle(m: Menu) {
    const on = registered.has(`${m.date}|${m.mealType}`);
    setBusy(m.id);
    try {
      const res = await api<{ registered: number; cancelled: number }>(`/parent/children/${child!.id}/meals`, {
        method: 'POST',
        body: { mealType: m.mealType, dates: [m.date], action: on ? 'CANCEL' : 'REGISTER' },
      });
      message.success(on ? (res.cancelled ? 'Đã hủy suất ăn' : 'Không có thay đổi') : res.registered ? 'Đã đăng ký suất ăn' : 'Không có thay đổi');
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const count = data?.registrations.length ?? 0;
  const cost = (data?.menus ?? []).filter((m) => registered.has(`${m.date}|${m.mealType}`)).reduce((s, m) => s + m.price, 0);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong>Bán trú · {child.fullName}</Typography.Text>
        <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} format="MM/YYYY" allowClear={false} />
      </div>
      <Card size="small">
        Đã đăng ký <b>{count}</b> suất trong tháng · dự kiến <b>{vnd(cost)}</b>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Có thể đăng ký hoặc hủy đến giờ chốt của từng ngày (ghi trên mỗi suất).
        </Typography.Paragraph>
      </Card>
      <List
        loading={isLoading}
        dataSource={data?.menus ?? []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nhà trường chưa công bố thực đơn tháng này" /> }}
        renderItem={(m) => {
          const on = registered.has(`${m.date}|${m.mealType}`);
          const past = m.date < today;
          return (
            <Card size="small" style={{ marginBottom: 8, borderColor: on ? '#86efac' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong>
                    {dayjs(m.date).format('dd, DD/MM')} · {MEAL_TYPE[m.mealType] ?? m.mealType}
                  </Typography.Text>
                  <div style={{ color: '#374151' }}>{m.dishes.join(', ')}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {vnd(m.price)} · chốt {m.cutoff}
                  </Typography.Text>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {on && <Tag color="green">Đã đăng ký</Tag>}
                  <div>
                    <Button size="small" type={on ? 'default' : 'primary'} danger={on} loading={busy === m.id} disabled={past} onClick={() => toggle(m)}>
                      {on ? 'Hủy' : 'Đăng ký'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        }}
      />
    </div>
  );
}

'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { App, Button, Tabs } from 'antd';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { AlertEventsTable } from '@/components/alerts/AlertEventsTable';
import { RulesPanel } from '@/components/alerts/RulesPanel';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Cảnh báo: the school's threshold rules and the events they raised. */
export default function AlertsSettingsPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { mutate } = useSWRConfig();
  const [running, setRunning] = useState(false);
  const canEdit = me?.role === 'ADMIN';

  async function evaluateNow() {
    setRunning(true);
    try {
      const r = await api<{ date: string; fired: number; created: number }>('/alerts/evaluate', { method: 'POST', body: {} });
      message.success(r.created ? `Đã phát sinh ${r.created} cảnh báo mới cho ngày ${r.date.split('-').reverse().join('/')}` : `Không có cảnh báo mới (${r.fired} quy tắc đang vượt ngưỡng hôm nay)`);
      mutate((key) => Array.isArray(key) && key[0] === '/alerts/events');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Cảnh báo"
        extra={
          canEdit && (
            <Button icon={<ReloadOutlined />} loading={running} onClick={evaluateNow}>
              Kiểm tra hôm nay
            </Button>
          )
        }
      />
      <Tabs
        items={[
          { key: 'events', label: 'Cảnh báo đã phát sinh', children: <AlertEventsTable endpoint="/alerts/events" ackEndpoint={(id) => `/alerts/events/${id}/ack`} canAck={me?.role !== 'TEACHER'} /> },
          { key: 'rules', label: 'Quy tắc', children: <RulesPanel endpoint="/alerts/rules" canEdit={canEdit} /> },
        ]}
      />
    </>
  );
}

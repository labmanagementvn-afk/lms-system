'use client';

import { Tabs } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ComposeTab, SmsDraft } from '@/components/sms/ComposeTab';
import { HistoryTab } from '@/components/sms/HistoryTab';
import { QuotaTab } from '@/components/sms/QuotaTab';
import { TemplatesTab } from '@/components/sms/TemplatesTab';

/**
 * Tin nhắn SMS: texts to parents (and, for the office, to teachers) with
 * templates, scheduling and a monthly quota per class.
 */
export default function SmsPage() {
  const [tab, setTab] = useState('compose');
  const [draft, setDraft] = useState<SmsDraft | null>(null);
  return (
    <>
      <PageHeader title="Tin nhắn SMS" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'compose', label: 'Soạn tin', children: <ComposeTab draft={draft} onSent={() => setTab('history')} /> },
          { key: 'history', label: 'Đã gửi', children: <HistoryTab /> },
          { key: 'templates', label: 'Mẫu tin nhắn', children: <TemplatesTab onUse={(d) => (setDraft({ ...d }), setTab('compose'))} /> },
          { key: 'quota', label: 'Hạn mức', children: <QuotaTab /> },
        ]}
      />
    </>
  );
}

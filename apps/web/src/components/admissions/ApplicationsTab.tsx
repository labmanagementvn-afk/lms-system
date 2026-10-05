'use client';

import { DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Select, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { APPLICATION_SOURCE, APPLICATION_STATUS, options } from '@/lib/labels';
import { ApplicationDrawer } from './ApplicationDrawer';
import { ApplicationFormModal } from './ApplicationFormModal';
import { EnrolModal } from './EnrolModal';
import { ImportModal } from './ImportModal';
import { downloadCsv, fmtDate } from './shared';

const sourceOptions = options(APPLICATION_SOURCE);
const statusOptions = Object.entries(APPLICATION_STATUS).map(([value, s]) => ({ value, label: s.label }));

export function ApplicationsTab() {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', roundId: undefined as string | undefined, status: undefined as string | undefined, source: undefined as string | undefined });
  const { data, isLoading, mutate } = useSWR<any>(['/admissions/applications', query]);
  const { data: rounds, mutate: mutateRounds } = useSWR<any[]>(['/admissions/rounds']);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState(false);
  const refresh = () => {
    mutate();
    mutateRounds();
  };

  async function exportCsv() {
    try {
      await downloadCsv('/admissions/applications/export', { roundId: query.roundId }, 'ho-so-tuyen-sinh.csv');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function bulkEnrol(classId: string) {
    try {
      const r = await api('/admissions/applications/bulk-enrol', { method: 'POST', body: { ids: selected, classId } });
      setBulk(false);
      setSelected([]);
      refresh();
      const failed = r.results.filter((x: any) => !x.ok);
      if (failed.length) {
        const byId = new Map<string, any>(data?.items.map((i: any) => [i.id, i]));
        modal.warning({
          title: `Đã nhập học ${r.enrolled} hồ sơ, ${r.failed} hồ sơ không nhập được`,
          content: (
            <ul style={{ paddingLeft: 18 }}>
              {failed.map((x: any) => (
                <li key={x.id}>
                  {byId.get(x.id)?.code ?? x.id}: {x.error}
                </li>
              ))}
            </ul>
          ),
        });
      } else message.success(`Đã nhập học ${r.enrolled} hồ sơ`);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const round = rounds?.find((r) => r.id === query.roundId);
  const hasOpenRound = rounds?.some((r) => r.status === 'OPEN');

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="Đợt tuyển sinh"
          allowClear
          style={{ width: 300 }}
          value={query.roundId}
          options={rounds?.map((r) => ({ value: r.id, label: `${r.name} (${r.total})` }))}
          onChange={(roundId) => setQuery({ ...query, roundId, page: 1 })}
        />
        <Select placeholder="Trạng thái" allowClear style={{ width: 150 }} options={statusOptions} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Select placeholder="Nguồn" allowClear style={{ width: 140 }} options={sourceOptions} onChange={(source) => setQuery({ ...query, source, page: 1 })} />
        <Input.Search placeholder="Tìm theo tên, mã hồ sơ, SĐT" allowClear style={{ width: 260 }} onSearch={(q) => setQuery({ ...query, q, page: 1 })} />
        <Button type="primary" icon={<PlusOutlined />} disabled={!hasOpenRound} onClick={() => setAdding({ roundId: round?.status === 'OPEN' ? round.id : undefined })}>
          Thêm hồ sơ
        </Button>
        <Button icon={<UploadOutlined />} disabled={!hasOpenRound} onClick={() => setImporting(true)}>
          Nhập từ CSV
        </Button>
        <Button icon={<DownloadOutlined />} onClick={exportCsv}>
          Xuất CSV
        </Button>
      </Space>
      {round?.capacity && round.acceptedCount >= round.capacity && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`Đợt "${round.name}" đã đủ chỉ tiêu: ${round.acceptedCount}/${round.capacity} trúng tuyển.`} />
      )}
      {selected.length > 0 && (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={`Đã chọn ${selected.length} hồ sơ trúng tuyển`}
          action={
            <Space>
              <Button size="small" type="primary" onClick={() => setBulk(true)}>
                Nhập học
              </Button>
              <Button size="small" onClick={() => setSelected([])}>
                Bỏ chọn
              </Button>
            </Space>
          }
        />
      )}
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1100 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (r) => ({ disabled: r.status !== 'ACCEPTED' }),
        }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, showTotal: (t) => `${t} hồ sơ`, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã hồ sơ', dataIndex: 'code', width: 110 },
          { title: 'Họ và tên', dataIndex: 'fullName' },
          { title: 'Ngày sinh', dataIndex: 'dateOfBirth', width: 105, render: fmtDate },
          { title: 'Phụ huynh', render: (_, r) => `${r.guardianName} · ${r.guardianPhone}` },
          { title: 'Đợt', width: 180, ellipsis: true, render: (_, r) => r.round.name },
          { title: 'Nguồn', dataIndex: 'source', width: 110, render: (s) => APPLICATION_SOURCE[s] },
          { title: 'Điểm', dataIndex: 'score', width: 70, align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (s) => <Tag color={APPLICATION_STATUS[s].color}>{APPLICATION_STATUS[s].label}</Tag> },
          { title: 'Lớp', width: 70, render: (_, r) => r.class?.name },
          { title: 'Ngày nộp', dataIndex: 'submittedAt', width: 105, render: fmtDate },
        ]}
      />
      <ApplicationDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
      <ApplicationFormModal record={adding} rounds={rounds} onClose={() => setAdding(null)} onSaved={refresh} />
      <ImportModal open={importing} rounds={rounds} defaultRoundId={round?.status === 'OPEN' ? round.id : undefined} onClose={() => setImporting(false)} onDone={refresh} />
      <EnrolModal open={bulk} count={selected.length} gradeLevel={round?.gradeLevel} onClose={() => setBulk(false)} onSubmit={bulkEnrol} />
    </>
  );
}

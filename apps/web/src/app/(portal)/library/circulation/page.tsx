'use client';

import { BarcodeOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Input, InputNumber, InputRef, Popconfirm, Radio, Row, Select, Space, Statistic, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { useAllTeachers } from '@/lib/hooks';
import { COPY_STATUS } from '@/lib/labels';

const fmt = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');

export default function CirculationPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: stats } = useSWR<any>(['/library/stats']);
  const scanRef = useRef<InputRef>(null);
  const [code, setCode] = useState('');
  const [copy, setCopy] = useState<any | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);
  const editable = canEditStudents(me);

  const refocus = () => setTimeout(() => scanRef.current?.focus(), 0);
  // Refresh stats, loan lists and catalogue counts after any circulation action.
  const refreshAll = () => globalMutate((key) => Array.isArray(key) && String(key[0]).startsWith('/library'));

  async function lookup(barcode = code) {
    const value = barcode.trim();
    if (!value) return;
    try {
      setCopy(await api(`/library/copies/by-barcode/${encodeURIComponent(value)}`));
      setNotice(null);
    } catch (e) {
      setCopy(null);
      message.error((e as Error).message);
    }
    setCode('');
    refocus();
  }

  async function giveBack() {
    try {
      const res = await api('/library/returns', { method: 'POST', body: { barcode: copy.barcode } });
      const who = res.loan.student ?? res.loan.teacher;
      const parts = [`Đã nhận trả "${res.loan.copy.book.title}" từ ${who.fullName}.`];
      if (res.overdueDays > 0) parts.push(`Trả muộn ${res.overdueDays} ngày.`);
      if (res.nextReservation) parts.push(`Giữ sách cho ${res.nextReservation.student.fullName} (${res.nextReservation.student.code}) đã đặt trước.`);
      setNotice({ type: res.overdueDays > 0 || res.nextReservation ? 'warning' : 'success', text: parts.join(' ') });
      setCopy(null);
      refreshAll();
    } catch (e) {
      message.error((e as Error).message);
    }
    refocus();
  }

  function lent(loan: any) {
    const who = loan.student ?? loan.teacher;
    setNotice({ type: 'success', text: `Đã cho ${who.fullName} mượn "${loan.copy.book.title}", hạn trả ${fmt(loan.dueAt)}.` });
    setCopy(null);
    refreshAll();
    refocus();
  }

  return (
    <>
      <PageHeader title="Mượn trả sách" />
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          ['Đầu sách', stats?.titles],
          ['Bản sách', stats?.copies],
          ['Đang mượn', stats?.onLoan],
          ['Quá hạn', stats?.overdue, '#cf1322'],
          ['Đặt trước', stats?.activeReservations],
        ].map(([title, value, color]) => (
          <Col key={title} xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title={title} value={value ?? 0} valueStyle={color ? { color: String(color) } : undefined} />
            </Card>
          </Col>
        ))}
      </Row>
      {editable && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Input
            ref={scanRef}
            autoFocus
            size="large"
            prefix={<BarcodeOutlined />}
            placeholder="Quét mã vạch"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPressEnter={() => lookup()}
            allowClear
            style={{ maxWidth: 420 }}
          />
          {notice && <Alert type={notice.type} message={notice.text} showIcon closable onClose={() => setNotice(null)} style={{ marginTop: 12 }} />}
          {copy && <CopyPanel copy={copy} onReturn={giveBack} onLent={lent} />}
        </Card>
      )}
      {editable ? (
        <Tabs
          items={[
            { key: 'active', label: 'Đang mượn', children: <LoanTable status="active" onChanged={refreshAll} /> },
            { key: 'overdue', label: 'Quá hạn', children: <LoanTable status="overdue" onChanged={refreshAll} /> },
            { key: 'returned', label: 'Đã trả', children: <LoanTable status="returned" onChanged={refreshAll} /> },
          ]}
        />
      ) : (
        <Alert type="info" showIcon message="Chỉ nhân viên thư viện được xem và xử lý mượn trả" />
      )}
    </>
  );
}

function CopyPanel({ copy, onReturn, onLent }: { copy: any; onReturn: () => void; onLent: (loan: any) => void }) {
  const status = COPY_STATUS[copy.status];
  const queue: any[] = copy.book.reservations;
  return (
    <div style={{ marginTop: 16 }}>
      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, md: 2 }}
        items={[
          { label: 'Sách', children: <b>{copy.book.title}</b> },
          { label: 'Tác giả', children: copy.book.author },
          { label: 'Mã vạch', children: copy.barcode },
          { label: 'Trạng thái', children: <Tag color={status.color}>{status.label}</Tag> },
          ...(copy.loan
            ? [
                { label: 'Người mượn', children: `${(copy.loan.student ?? copy.loan.teacher).fullName} (${(copy.loan.student ?? copy.loan.teacher).code})` },
                {
                  label: 'Hạn trả',
                  children: (
                    <span style={{ color: copy.loan.overdueDays ? '#cf1322' : undefined }}>
                      {fmt(copy.loan.dueAt)}
                      {copy.loan.overdueDays > 0 && ` · quá hạn ${copy.loan.overdueDays} ngày`}
                    </span>
                  ),
                },
              ]
            : []),
          ...(queue.length ? [{ label: 'Đặt trước', children: queue.map((r, i) => `${i + 1}. ${r.student.fullName} (${r.student.code})`).join(', ') }] : []),
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {copy.status === 'BORROWED' && (
          <Button type="primary" size="large" onClick={onReturn}>
            Nhận trả
          </Button>
        )}
        {copy.status === 'AVAILABLE' && <BorrowForm barcode={copy.barcode} holder={queue[0]?.student} onLent={onLent} />}
        {(copy.status === 'LOST' || copy.status === 'RETIRED') && <Alert type="error" showIcon message="Bản sách này không còn lưu hành, không thể cho mượn" />}
      </div>
    </div>
  );
}

function BorrowForm({ barcode, holder, onLent }: { barcode: string; holder?: any; onLent: (loan: any) => void }) {
  const { message } = App.useApp();
  const [kind, setKind] = useState<'student' | 'teacher'>('student');
  const [personId, setPersonId] = useState<string | undefined>(holder?.id);
  const [days, setDays] = useState(14);
  const [q, setQ] = useState('');
  const { data: students } = useSWR<any>(kind === 'student' ? ['/students', { q, pageSize: 20 }] : null);
  const { data: teachers } = useAllTeachers();

  useEffect(() => setPersonId(kind === 'student' ? holder?.id : undefined), [kind, holder?.id]);

  const studentOptions = students?.items.map((s: any) => ({ value: s.id, label: `${s.code} · ${s.fullName}${s.enrollments[0] ? ` (${s.enrollments[0].class.name})` : ''}` })) ?? [];
  if (holder && !studentOptions.some((o: any) => o.value === holder.id)) studentOptions.unshift({ value: holder.id, label: `${holder.code} · ${holder.fullName}` });

  async function borrow() {
    try {
      const loan = await api('/library/loans', { method: 'POST', body: { barcode, days, [kind === 'student' ? 'studentId' : 'teacherId']: personId } });
      onLent(loan);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Space wrap align="center">
      <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)} optionType="button">
        <Radio.Button value="student">Học sinh</Radio.Button>
        <Radio.Button value="teacher">Giáo viên</Radio.Button>
      </Radio.Group>
      {kind === 'student' ? (
        <Select showSearch allowClear filterOption={false} value={personId} onSearch={setQ} onChange={setPersonId} placeholder="Tìm học sinh theo tên hoặc mã" style={{ width: 320 }} options={studentOptions} />
      ) : (
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          value={personId}
          onChange={setPersonId}
          placeholder="Chọn giáo viên"
          style={{ width: 320 }}
          options={teachers?.items.map((t) => ({ value: t.id, label: `${t.code} · ${t.fullName}` }))}
        />
      )}
      <Space.Compact>
        <InputNumber min={1} max={60} value={days} onChange={(v) => setDays(v ?? 14)} style={{ width: 80 }} />
        <Button disabled tabIndex={-1}>
          ngày
        </Button>
      </Space.Compact>
      <Button type="primary" size="large" disabled={!personId} onClick={borrow}>
        Cho mượn
      </Button>
      {holder && <Tag color="gold">Đang giữ cho {holder.fullName}</Tag>}
    </Space>
  );
}

function LoanTable({ status, onChanged }: { status: 'active' | 'overdue' | 'returned'; onChanged: () => void }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status });
  const { data, isLoading } = useSWR<any>(['/library/loans', query]);

  async function renew(id: string) {
    try {
      const loan = await api(`/library/loans/${id}/renew`, { method: 'POST' });
      message.success(`Đã gia hạn đến ${fmt(loan.dueAt)}`);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Input.Search placeholder="Tìm theo người mượn, tên sách, mã vạch" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 320, marginBottom: 12 }} />
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã vạch', width: 130, render: (_, l) => l.copy.barcode },
          { title: 'Sách', render: (_, l) => l.copy.book.title },
          {
            title: 'Người mượn',
            render: (_, l) => {
              const who = l.student ?? l.teacher;
              return (
                <>
                  <Tag>{l.student ? 'HS' : 'GV'}</Tag>
                  {who.fullName} <span style={{ color: '#888' }}>({who.code})</span>
                </>
              );
            },
          },
          { title: 'Ngày mượn', dataIndex: 'borrowedAt', width: 110, render: fmt },
          {
            title: 'Hạn trả',
            width: 170,
            render: (_, l) => (
              <span style={{ color: !l.returnedAt && l.overdueDays ? '#cf1322' : undefined }}>
                {fmt(l.dueAt)}
                {l.overdueDays > 0 && <Tag color="red" style={{ marginLeft: 6 }}>{`${l.returnedAt ? 'Trễ' : 'Quá'} ${l.overdueDays} ngày`}</Tag>}
              </span>
            ),
          },
          ...(status === 'returned'
            ? [{ title: 'Ngày trả', dataIndex: 'returnedAt', width: 110, render: fmt }]
            : [{ title: 'Gia hạn', dataIndex: 'renewCount', width: 80, render: (n: number) => `${n}/2` }]),
          ...(status !== 'returned'
            ? [
                {
                  title: '',
                  width: 100,
                  render: (_: unknown, l: any) => (
                    <Popconfirm title="Gia hạn thêm 14 ngày?" onConfirm={() => renew(l.id)}>
                      <Button size="small" disabled={l.overdueDays > 0 || l.renewCount >= 2}>
                        Gia hạn
                      </Button>
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

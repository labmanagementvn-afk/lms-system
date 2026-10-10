'use client';

import { DeleteOutlined, FilePdfOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadFile } from '@/components/grades/download';
import { RecordAction, RecordActionModal } from '@/components/students/RecordActionModal';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { AWARD_FORM, DISCIPLINE_MEASURE, dmy } from '@/lib/labels';

/** Khen thưởng và kỷ luật học sinh under Thông tư 19/2025/TT-BGDĐT. */
export default function MeritsPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const [tab, setTab] = useState<'awards' | 'discipline'>('awards');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month').subtract(1, 'month'), dayjs()]);
  const [classId, setClassId] = useState<string>();
  const [action, setAction] = useState<RecordAction | null>(null);
  const query = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), classId };
  const awards = useSWR<any[]>(tab === 'awards' ? ['/students/awards', query] : null);
  const discipline = useSWR<any[]>(tab === 'discipline' ? ['/students/discipline', query] : null);
  const office = canEditStudents(me);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      message.success(ok);
      awards.mutate();
      discipline.mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  const print = (key: string) => run(() => downloadFile(`/reports/${key}`, { ...query, format: 'pdf' }, `${key}-${query.from}-${query.to}.pdf`), 'Đã tải báo cáo');
  const removable = (r: any) => me?.role === 'ADMIN' || r.createdById === me?.id;
  const student = (r: any) => <Link href={`/students/${r.student.id}`}>{r.student.fullName}</Link>;

  return (
    <>
      <PageHeader
        title="Khen thưởng, kỷ luật"
        extra={
          <Space wrap>
            {(tab === 'awards' || office) && (
              <Button icon={<FilePdfOutlined />} onClick={() => print(tab === 'awards' ? 'student-awards' : 'student-discipline')}>
                In danh sách
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction(tab === 'awards' ? 'award' : 'discipline')}>
              {tab === 'awards' ? 'Ghi nhận khen thưởng' : 'Ghi nhận vi phạm'}
            </Button>
          </Space>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} format="DD/MM/YYYY" allowClear={false} />
        <Select placeholder="Lớp" allowClear showSearch optionFilterProp="label" style={{ width: 120 }} value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      </Space>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'awards' | 'discipline')}
        items={[
          {
            key: 'awards',
            label: 'Khen thưởng',
            children: (
              <Table<any>
                rowKey="id"
                size="small"
                loading={awards.isLoading}
                dataSource={awards.data}
                scroll={{ x: 900 }}
                pagination={{ pageSize: 50, hideOnSinglePage: true }}
                columns={[
                  { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
                  { title: 'Học sinh', render: (_, r) => student(r) },
                  { title: 'Lớp', width: 70, render: (_, r) => r.class?.name },
                  { title: 'Hình thức', dataIndex: 'form', width: 230, render: (f) => <Tag color="gold">{AWARD_FORM[f]}</Tag> },
                  { title: 'Nội dung', dataIndex: 'content' },
                  { title: 'Người khen', width: 160, render: (_, r) => r.issuer ?? r.createdBy },
                  {
                    title: '',
                    width: 50,
                    render: (_, r) =>
                      removable(r) && (
                        <Popconfirm title="Xóa khen thưởng này?" onConfirm={() => run(() => api(`/students/awards/${r.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'discipline',
            label: 'Kỷ luật',
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Thông tư 19/2025/TT-BGDĐT: biện pháp kỷ luật mang tính giáo dục, không xúc phạm học sinh. Bản tự kiểm điểm cần gia đình xác nhận; phụ huynh xác nhận trên ứng dụng."
                />
                <Table<any>
                  rowKey="id"
                  size="small"
                  loading={discipline.isLoading}
                  dataSource={discipline.data}
                  scroll={{ x: 1000 }}
                  pagination={{ pageSize: 50, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
                    { title: 'Học sinh', render: (_, r) => student(r) },
                    { title: 'Lớp', width: 70, render: (_, r) => r.class?.name },
                    { title: 'Hành vi vi phạm', dataIndex: 'violation' },
                    { title: 'Mức độ', dataIndex: 'severity', width: 70, align: 'center' },
                    { title: 'Biện pháp', dataIndex: 'measure', width: 210, render: (m) => <Tag color={DISCIPLINE_MEASURE[m].color}>{DISCIPLINE_MEASURE[m].label}</Tag> },
                    {
                      title: 'Gia đình',
                      width: 130,
                      render: (_, r) => (r.measure !== 'SELF_REVIEW' ? null : r.familyConfirmedAt ? <Tag color="green">Đã xác nhận</Tag> : <Tag color="gold">Chờ xác nhận</Tag>),
                    },
                    { title: 'Người ghi nhận', dataIndex: 'createdBy', width: 150 },
                    {
                      title: '',
                      width: 50,
                      render: (_, r) =>
                        removable(r) && (
                          <Popconfirm title="Xóa bản ghi này?" onConfirm={() => run(() => api(`/students/discipline/${r.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                          </Popconfirm>
                        ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <RecordActionModal
        action={action}
        students={[]}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          awards.mutate();
          discipline.mutate();
        }}
      />
    </>
  );
}

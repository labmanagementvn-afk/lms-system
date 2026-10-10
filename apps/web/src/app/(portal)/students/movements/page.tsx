'use client';

import { FilePdfOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadFile } from '@/components/grades/download';
import { useClasses } from '@/lib/hooks';
import { dmy, MOVEMENT_KIND } from '@/lib/labels';

const UP = ['ENROLLED', 'TRANSFER_IN', 'RETURNED'];
const DOWN = ['TRANSFER_OUT', 'DROPPED'];

/** Biến động học sinh: who entered, changed class, left or came back in a period. */
export default function MovementsPage() {
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month').subtract(1, 'month'), dayjs()]);
  const [kind, setKind] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const query = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), kind, classId };
  const { data, isLoading } = useSWR<any[]>(['/students/movements', query]);
  const rows = data ?? [];
  const count = (kinds: string[]) => rows.filter((r) => kinds.includes(r.kind)).length;

  async function print() {
    try {
      await downloadFile('/reports/student-movements', { from: query.from, to: query.to, format: 'pdf' }, `bien-dong-hoc-sinh-${query.from}-${query.to}.pdf`);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Biến động học sinh"
        extra={
          <Button icon={<FilePdfOutlined />} onClick={print}>
            In danh sách biến động
          </Button>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} format="DD/MM/YYYY" allowClear={false} />
        <Select placeholder="Loại biến động" allowClear style={{ width: 170 }} value={kind} onChange={setKind} options={Object.entries(MOVEMENT_KIND).map(([value, k]) => ({ value, label: k.label }))} />
        <Select placeholder="Lớp" allowClear showSearch optionFilterProp="label" style={{ width: 120 }} value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      </Space>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Tăng" value={count(UP)} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Giảm" value={count(DOWN)} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Chuyển lớp" value={count(['CLASS_CHANGE'])} valueStyle={{ color: '#2563eb' }} />
          </Card>
        </Col>
      </Row>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={rows}
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
          { title: 'Học sinh', render: (_, r) => <Link href={`/students/${r.student.id}`}>{r.student.fullName}</Link> },
          { title: 'Mã HS', width: 130, render: (_, r) => r.student.code },
          { title: 'Biến động', dataIndex: 'kind', width: 120, render: (k) => <Tag color={MOVEMENT_KIND[k].color}>{MOVEMENT_KIND[k].label}</Tag> },
          { title: 'Từ lớp', width: 80, render: (_, r) => r.fromClass?.name },
          { title: 'Đến lớp', width: 80, render: (_, r) => r.toClass?.name },
          { title: 'Trường đi / đến', dataIndex: 'otherSchool' },
          { title: 'Lý do', dataIndex: 'reason' },
          { title: 'Số văn bản', dataIndex: 'documentNo', width: 120 },
        ]}
      />
    </>
  );
}

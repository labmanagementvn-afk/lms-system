'use client';

import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Progress, Row, Select, Space, Statistic, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { StudentSelect } from '@/components/StudentSelect';
import { api, clean } from '@/lib/api';
import { useClasses } from '@/lib/hooks';
import { INVOICE_STATUS, PAYMENT_METHOD, vnd } from '@/lib/labels';
import { InvoiceDrawer } from './InvoiceDrawer';

export default function InvoicesPage() {
  return (
    <Suspense>
      <Invoices />
    </Suspense>
  );
}

function Invoices() {
  const params = useSearchParams();
  const [tab, setTab] = useState('invoices');
  return (
    <>
      <PageHeader title="Công nợ & thu tiền" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'invoices', label: 'Hóa đơn', children: <InvoiceList initialCampaignId={params.get('campaignId') ?? undefined} /> },
          { key: 'payments', label: 'Phiếu thu', children: <PaymentList /> },
        ]}
      />
    </>
  );
}

function InvoiceList({ initialCampaignId }: { initialCampaignId?: string }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState({
    page: 1,
    pageSize: 20,
    q: '',
    status: undefined as string[] | undefined,
    campaignId: initialCampaignId,
    classId: undefined as string | undefined,
  });
  const { data, isLoading, mutate } = useSWR<any>(['/finance/invoices', query]);
  const { data: summary, mutate: mutateSummary } = useSWR<any>(['/finance/summary', { campaignId: query.campaignId }]);
  const { data: campaigns } = useSWR<any[]>(['/finance/campaigns']);
  const { data: classes } = useClasses();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  async function createManual() {
    const values = await form.validateFields();
    try {
      const inv = await api('/finance/invoices', {
        method: 'POST',
        body: clean({ ...values, dueDate: values.dueDate?.format('YYYY-MM-DD'), lines: values.lines.map((l: any) => clean(l)) }),
      });
      message.success('Đã lập hóa đơn');
      setCreating(false);
      mutate();
      setSelected(inv.id);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const refresh = () => {
    mutate();
    mutateSummary();
  };

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Tổng phải thu" value={vnd(summary?.billed)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Đã thu" value={vnd(summary?.collected)} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Còn nợ" value={vnd(summary?.outstanding)} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <div style={{ color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Tỷ lệ thu</div>
            <Progress percent={summary?.billed ? Math.round((summary.collected / summary.billed) * 100) : 0} />
          </Card>
        </Col>
      </Row>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm học sinh" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 220 }} />
        <Select
          placeholder="Đợt thu"
          allowClear
          value={query.campaignId}
          style={{ width: 220 }}
          options={campaigns?.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(campaignId) => setQuery({ ...query, campaignId, page: 1 })}
        />
        <Select placeholder="Lớp" allowClear style={{ width: 120 }} options={classes?.map((c) => ({ value: c.id, label: c.name }))} onChange={(classId) => setQuery({ ...query, classId, page: 1 })} />
        <Select
          mode="multiple"
          placeholder="Trạng thái"
          allowClear
          style={{ minWidth: 200 }}
          options={Object.entries(INVOICE_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          onChange={(status) => setQuery({ ...query, status: status.length ? status : undefined, page: 1 })}
        />
        <Button icon={<PlusOutlined />} onClick={() => (form.resetFields(), setCreating(true))}>
          Lập hóa đơn lẻ
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        onRow={(r) => ({ onClick: () => setSelected(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã TT', dataIndex: 'paymentRef', width: 120 },
          { title: 'Học sinh', render: (_, r) => `${r.student.code} - ${r.student.fullName}` },
          { title: 'Lớp', width: 80, render: (_, r) => r.student.enrollments[0]?.class.name },
          { title: 'Nội dung', dataIndex: 'title' },
          { title: 'Phải thu', dataIndex: 'total', align: 'right', render: vnd },
          { title: 'Đã thu', dataIndex: 'paidAmount', align: 'right', render: vnd },
          { title: 'Hạn nộp', dataIndex: 'dueDate', width: 110, render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '') },
          { title: 'Trạng thái', dataIndex: 'status', width: 150, render: (s) => <Tag color={INVOICE_STATUS[s].color}>{INVOICE_STATUS[s].label}</Tag> },
        ]}
      />
      <InvoiceDrawer id={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <Modal title="Lập hóa đơn lẻ" open={creating} onOk={createManual} onCancel={() => setCreating(false)} okText="Lập hóa đơn" cancelText="Hủy" width={640} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ lines: [{}] }}>
          <Form.Item name="studentId" label="Học sinh" rules={[{ required: true }]}>
            <StudentSelect />
          </Form.Item>
          <Space wrap>
            <Form.Item name="title" label="Nội dung" rules={[{ required: true }]}>
              <Input style={{ width: 340 }} placeholder="Phí dã ngoại học kỳ I" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn nộp">
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'description']} rules={[{ required: true, message: 'Nhập nội dung' }]}>
                      <Input placeholder="Khoản" style={{ width: 260 }} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'quantity']}>
                      <InputNumber min={1} placeholder="SL" style={{ width: 70 }} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'unitPrice']} rules={[{ required: true, message: 'Nhập đơn giá' }]}>
                      <InputNumber min={0} placeholder="Đơn giá" style={{ width: 150 }} addonAfter="₫" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(f.name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Thêm dòng
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

function PaymentList() {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', method: undefined as string | undefined, from: undefined as string | undefined, to: undefined as string | undefined });
  const { data, isLoading } = useSWR<any>(['/finance/payments', query]);
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Số phiếu, học sinh" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 220 }} />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          onChange={(r) => setQuery({ ...query, from: r?.[0]?.format('YYYY-MM-DD'), to: r?.[1]?.format('YYYY-MM-DD'), page: 1 })}
        />
        <Select placeholder="Hình thức" allowClear style={{ width: 160 }} options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} onChange={(method) => setQuery({ ...query, method, page: 1 })} />
        <Statistic title="Tổng tiền (không tính phiếu hủy)" value={vnd(data?.totalAmount)} valueStyle={{ fontSize: 18 }} />
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 900 }}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Số phiếu', dataIndex: 'receiptNo', width: 140 },
          { title: 'Ngày thu', dataIndex: 'paidAt', width: 150, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm') },
          { title: 'Học sinh', render: (_, r) => `${r.student.code} - ${r.student.fullName}` },
          { title: 'Nội dung', render: (_, r) => r.invoice.title },
          { title: 'Hình thức', dataIndex: 'method', width: 130, render: (m) => PAYMENT_METHOD[m] },
          { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: vnd },
          { title: '', dataIndex: 'status', width: 90, render: (s, r) => (s === 'VOIDED' ? <Tag title={r.voidReason}>Đã hủy</Tag> : null) },
        ]}
      />
    </>
  );
}

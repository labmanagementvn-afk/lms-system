'use client';

import { LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Space, Statistic, Table, Tabs, Tag, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { DAY_STATUS, DIRECTION, EVENT_METHOD } from '@/lib/labels';
import { formatTime, todayIn, zonedIso } from '@/lib/time';

export default function AttendancePage() {
  const tz = useAuth().me!.school.timezone;
  const [date, setDate] = useState<Dayjs>(dayjs(todayIn(tz)));
  return (
    <>
      <PageHeader
        title="Điểm danh ra vào trường"
        extra={<DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />}
      />
      <Tabs
        items={[
          { key: 'daily', label: 'Báo cáo theo ngày', children: <DailyReport date={date.format('YYYY-MM-DD')} /> },
          { key: 'events', label: 'Nhật ký quét', children: <EventLog date={date.format('YYYY-MM-DD')} /> },
        ]}
      />
    </>
  );
}

function DailyReport({ date }: { date: string }) {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const [personType, setPersonType] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [classId, setClassId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const { data: classes } = useClasses();
  const { data, isLoading, mutate } = useSWR<any>(['/attendance/daily', { date, personType, classId: personType === 'STUDENT' ? classId : undefined }]);
  const [manual, setManual] = useState<{ person: any; direction: 'IN' | 'OUT' } | null>(null);
  const [form] = Form.useForm();

  async function saveManual() {
    const values = await form.validateFields();
    const isToday = date === todayIn(tz);
    if (!isToday && !values.time) {
      message.warning('Nhập giờ khi ghi nhận cho ngày khác hôm nay');
      return;
    }
    const occurredAt = values.time ? zonedIso(date, values.time, tz) : undefined;
    try {
      await api('/attendance/manual', {
        method: 'POST',
        body: {
          [personType === 'STUDENT' ? 'studentId' : 'teacherId']: manual!.person.id,
          direction: manual!.direction,
          occurredAt,
          note: values.note || undefined,
        },
      });
      message.success('Đã ghi nhận');
      setManual(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const rows = (data?.rows ?? []).filter((r: any) => !status || r.status === status);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group value={personType} onChange={(e) => setPersonType(e.target.value)} optionType="button">
          <Radio.Button value="STUDENT">Học sinh</Radio.Button>
          <Radio.Button value="TEACHER">Giáo viên</Radio.Button>
        </Radio.Group>
        {personType === 'STUDENT' && (
          <Select placeholder="Tất cả các lớp" allowClear style={{ width: 160 }} value={classId} onChange={setClassId} options={classes?.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
        )}
        <Select placeholder="Tất cả trạng thái" allowClear style={{ width: 160 }} value={status} onChange={setStatus} options={Object.entries(DAY_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </Space>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Tổng số" value={data?.summary.total ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Đúng giờ" value={data?.summary.onTime ?? '-'} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={`Đi muộn (sau ${data?.lateAfter ?? ''})`} value={data?.summary.late ?? '-'} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Vắng / chưa vào" value={data?.summary.absent ?? '-'} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
      </Row>
      <Table<any>
        rowKey={(r) => r.person.id}
        loading={isLoading}
        dataSource={rows}
        size="small"
        scroll={{ x: 760 }}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'Mã', width: 120, render: (_, r) => r.person.code },
          { title: 'Họ và tên', render: (_, r) => r.person.fullName },
          ...(personType === 'STUDENT' ? [{ title: 'Lớp', width: 80, render: (_: unknown, r: any) => r.person.className }] : []),
          { title: 'Giờ vào', width: 90, render: (_, r) => formatTime(r.firstIn, tz) },
          { title: 'Giờ ra', width: 90, render: (_, r) => formatTime(r.lastOut, tz) },
          { title: 'Lượt quét', dataIndex: 'eventCount', width: 90 },
          { title: 'Trạng thái', width: 110, render: (_, r) => <Tag color={DAY_STATUS[r.status].color}>{DAY_STATUS[r.status].label}</Tag> },
          {
            title: 'Ghi nhận thủ công',
            width: 150,
            render: (_, r) => (
              <Space>
                <Tooltip title="Ghi nhận vào">
                  <Button size="small" icon={<LoginOutlined />} onClick={() => (form.resetFields(), setManual({ person: r.person, direction: 'IN' }))}>
                    Vào
                  </Button>
                </Tooltip>
                <Tooltip title="Ghi nhận ra">
                  <Button size="small" icon={<LogoutOutlined />} onClick={() => (form.resetFields(), setManual({ person: r.person, direction: 'OUT' }))}>
                    Ra
                  </Button>
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={manual ? `Ghi nhận ${manual.direction === 'IN' ? 'vào' : 'ra'}: ${manual.person.fullName}` : ''}
        open={!!manual}
        onOk={saveManual}
        onCancel={() => setManual(null)}
        okText="Ghi nhận"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="time" label="Giờ (HH:mm)" extra="Để trống để lấy giờ hiện tại (chỉ với hôm nay)" rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Nhập theo dạng 07:05' }]}>
            <Input placeholder="07:05" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="Ví dụ: quên thẻ, phụ huynh đón sớm" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function EventLog({ date }: { date: string }) {
  const tz = useAuth().me!.school.timezone;
  const [unmatched, setUnmatched] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<any>(['/attendance/events', { date, unmatched: unmatched || undefined, page, pageSize: 50 }]);
  return (
    <>
      <Checkbox checked={unmatched} onChange={(e) => (setUnmatched(e.target.checked), setPage(1))} style={{ marginBottom: 12 }}>
        Chỉ hiện lượt quét chưa gán người (mã trên máy chưa khớp với học sinh/giáo viên)
      </Checkbox>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        size="small"
        scroll={{ x: 800 }}
        pagination={{ current: page, pageSize: 50, total: data?.total, onChange: setPage }}
        columns={[
          { title: 'Thời gian', width: 100, render: (_, e) => formatTime(e.occurredAt, tz, true) },
          {
            title: 'Người',
            render: (_, e) => {
              const p = e.student ?? e.teacher;
              return p ? `${p.fullName} (${p.code})` : <Tag color="red">Chưa gán · mã {e.externalPersonId}</Tag>;
            },
          },
          { title: 'Chiều', width: 90, render: (_, e) => DIRECTION[e.direction] },
          { title: 'Phương thức', width: 110, render: (_, e) => EVENT_METHOD[e.method] },
          { title: 'Thiết bị', render: (_, e) => e.device?.name ?? (e.source === 'MANUAL' ? 'Ghi nhận thủ công' : '') },
          { title: 'Ghi chú', dataIndex: 'note' },
        ]}
      />
    </>
  );
}

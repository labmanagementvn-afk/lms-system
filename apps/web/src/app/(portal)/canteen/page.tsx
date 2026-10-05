'use client';

import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { MEAL_TYPE, options, vnd } from '@/lib/labels';
import { todayIn } from '@/lib/time';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const fmtDate = (d: string) => `${WEEKDAY[dayjs(d).day()]} ${dayjs(d).format('DD/MM/YYYY')}`;

export default function CanteenPage() {
  return (
    <>
      <PageHeader title="Bán trú" />
      <Tabs
        items={[
          { key: 'menus', label: 'Thực đơn', children: <MenusTab /> },
          { key: 'register', label: 'Đăng ký suất ăn', children: <RegisterTab /> },
          { key: 'reports', label: 'Báo cáo', children: <ReportsTab /> },
        ]}
      />
    </>
  );
}

function MenusTab() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const tz = me!.school.timezone;
  const editable = canEditStudents(me);
  // Monday of the displayed week.
  const [week, setWeek] = useState<Dayjs>(() => {
    const d = dayjs(todayIn(tz));
    return d.subtract((d.day() + 6) % 7, 'day');
  });
  const from = week.format('YYYY-MM-DD');
  const to = week.add(6, 'day').format('YYYY-MM-DD');
  const { data, isLoading, mutate } = useSWR<any[]>(['/canteen/menus', { from, to }]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  function open(record?: any) {
    setEditing(record ?? {});
    form.resetFields();
    form.setFieldsValue(record ? { ...record, date: dayjs(record.date) } : { date: week, mealType: 'LUNCH', cutoff: '08:30', dishes: [] });
  }

  async function save() {
    const values = await form.validateFields();
    try {
      await api('/canteen/menus', { method: 'PUT', body: { ...values, date: values.date.format('YYYY-MM-DD') } });
      message.success('Đã lưu thực đơn');
      setEditing(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/canteen/menus/${id}`, { method: 'DELETE' });
      message.success('Đã xóa');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button icon={<LeftOutlined />} onClick={() => setWeek(week.subtract(7, 'day'))} aria-label="Tuần trước" />
        <DatePicker
          picker="week"
          value={week}
          allowClear={false}
          format={() => `${week.format('DD/MM')} - ${week.add(6, 'day').format('DD/MM/YYYY')}`}
          onChange={(d) => d && setWeek(d.subtract((d.day() + 6) % 7, 'day'))}
        />
        <Button icon={<RightOutlined />} onClick={() => setWeek(week.add(7, 'day'))} aria-label="Tuần sau" />
        {editable && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            Thêm thực đơn
          </Button>
        )}
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 800 }}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 140, render: fmtDate },
          { title: 'Bữa', dataIndex: 'mealType', width: 100, render: (t) => MEAL_TYPE[t] },
          { title: 'Món ăn', dataIndex: 'dishes', render: (d: string[]) => d.join(', ') },
          { title: 'Giá suất', dataIndex: 'price', width: 120, align: 'right', render: vnd },
          { title: 'Giờ chốt', dataIndex: 'cutoff', width: 90 },
          { title: 'Đã đăng ký', dataIndex: 'registered', width: 100, align: 'right' },
          ...(editable
            ? [
                {
                  title: '',
                  width: 96,
                  render: (_: unknown, r: any) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Sửa" />
                      <Popconfirm title="Xóa thực đơn này?" onConfirm={() => remove(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal title={editing?.id ? 'Sửa thực đơn' : 'Thêm thực đơn'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Lưu" cancelText="Hủy" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Space wrap>
            <Form.Item name="date" label="Ngày" rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" allowClear={false} disabled={!!editing?.id} />
            </Form.Item>
            <Form.Item name="mealType" label="Bữa" rules={[{ required: true }]}>
              <Select options={options(MEAL_TYPE)} style={{ width: 140 }} disabled={!!editing?.id} />
            </Form.Item>
          </Space>
          <Form.Item name="dishes" label="Món ăn" rules={[{ required: true, type: 'array', min: 1, message: 'Nhập ít nhất một món' }]}>
            <Select mode="tags" tokenSeparators={[',']} placeholder="Gõ tên món rồi Enter" open={false} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="price" label="Giá suất (₫)" rules={[{ required: true }]}>
              <InputNumber min={0} step={1000} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="cutoff" label="Giờ chốt đăng ký" rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Dạng HH:mm' }]}>
              <Input placeholder="08:30" style={{ width: 100 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}

function RegisterTab() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const tz = me!.school.timezone;
  const today = dayjs(todayIn(tz));
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [mealType, setMealType] = useState('LUNCH');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([today, today]);
  const [viewDate, setViewDate] = useState<Dayjs>(today);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const { data: menus } = useSWR<any[]>(['/canteen/menus', { from, to }]);
  const { data: students, isLoading } = useSWR<any[]>(classId ? [`/classes/${classId}/students`] : null);
  const { data: daily, mutate } = useSWR<any>(classId ? ['/canteen/daily', { date: viewDate.format('YYYY-MM-DD'), mealType, classId }] : null);
  const registeredIds = new Set<string>((daily?.students ?? []).map((s: any) => s.id));
  // Only days that have a menu for this meal can be registered (skips weekends and holidays).
  const menuDates: string[] = (menus ?? []).filter((m) => m.mealType === mealType).map((m) => m.date);

  async function submit(action: 'REGISTER' | 'CANCEL', studentIds?: string[]) {
    if (!classId) return;
    if (!menuDates.length) {
      message.warning(`Chưa có thực đơn ${MEAL_TYPE[mealType].toLowerCase()} trong khoảng ngày đã chọn`);
      return;
    }
    if (menuDates.length > 31) {
      message.warning('Mỗi lần chỉ đăng ký tối đa 31 ngày');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/canteen/registrations', {
        method: 'POST',
        body: { mealType, dates: menuDates, action, ...(studentIds?.length ? { studentIds } : { classId }) },
      });
      message.success(action === 'REGISTER' ? `Đã đăng ký ${res.registered} suất (bỏ qua ${res.skipped})` : `Đã hủy ${res.cancelled} suất (bỏ qua ${res.skipped})`);
      setSelected([]);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder="Chọn lớp" options={classes?.map((c) => ({ value: c.id, label: c.name }))} style={{ width: 140 }} value={classId} onChange={setClassId} />
        <Radio.Group options={options(MEAL_TYPE)} optionType="button" value={mealType} onChange={(e) => setMealType(e.target.value)} />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          allowClear={false}
          value={range}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
        />
      </Space>
      {!classId ? (
        <Alert type="info" showIcon message="Chọn lớp để đăng ký suất ăn" />
      ) : (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">{menuDates.length} ngày có thực đơn trong khoảng đã chọn.</Typography.Text>
            {selected.length ? (
              <>
                <Button type="primary" icon={<CheckOutlined />} loading={busy} onClick={() => submit('REGISTER', selected)}>
                  Đăng ký {selected.length} học sinh đã chọn
                </Button>
                <Button danger icon={<CloseOutlined />} loading={busy} onClick={() => submit('CANCEL', selected)}>
                  Hủy cho {selected.length} học sinh đã chọn
                </Button>
              </>
            ) : (
              <>
                <Button type="primary" icon={<CheckOutlined />} loading={busy} onClick={() => submit('REGISTER')}>
                  Đăng ký cả lớp
                </Button>
                <Popconfirm title="Hủy suất ăn của cả lớp trong các ngày đã chọn?" onConfirm={() => submit('CANCEL')}>
                  <Button danger icon={<CloseOutlined />} loading={busy}>
                    Hủy cả lớp
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            <span>Xem đăng ký ngày</span>
            <DatePicker format="DD/MM/YYYY" allowClear={false} value={viewDate} onChange={(d) => d && setViewDate(d)} />
            {daily && (
              <Typography.Text>
                {daily.menu ? `Thực đơn: ${daily.menu.dishes.join(', ')} · chốt lúc ${daily.menu.cutoff}` : 'Chưa có thực đơn'} · <b>{daily.total}</b> suất
              </Typography.Text>
            )}
          </Space>
          <Table<any>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={students}
            pagination={false}
            rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
            columns={[
              { title: 'Mã HS', dataIndex: 'code', width: 120 },
              { title: 'Họ và tên', dataIndex: 'fullName' },
              {
                title: `Ngày ${viewDate.format('DD/MM')}`,
                width: 160,
                render: (_, s) => (registeredIds.has(s.id) ? <Tag color="green">Đã đăng ký</Tag> : <Tag>Không ăn</Tag>),
              },
            ]}
          />
        </>
      )}
    </>
  );
}

function ReportsTab() {
  const tz = useAuth().me!.school.timezone;
  const { data: classes } = useClasses();
  const [date, setDate] = useState<Dayjs>(dayjs(todayIn(tz)));
  const [mealType, setMealType] = useState('LUNCH');
  const [month, setMonth] = useState<Dayjs>(dayjs(todayIn(tz)));
  const [classId, setClassId] = useState<string>();
  const { data: daily, isLoading: dailyLoading } = useSWR<any>(['/canteen/daily', { date: date.format('YYYY-MM-DD'), mealType }]);
  const { data: monthly, isLoading: monthlyLoading } = useSWR<any>(['/canteen/monthly', { month: month.format('YYYY-MM'), classId }]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card
          title="Suất ăn theo ngày"
          extra={
            <Space wrap>
              <DatePicker format="DD/MM/YYYY" allowClear={false} value={date} onChange={(d) => d && setDate(d)} />
              <Select options={options(MEAL_TYPE)} value={mealType} onChange={setMealType} style={{ width: 120 }} />
            </Space>
          }
        >
          <Space size="large" style={{ marginBottom: 12 }}>
            <Statistic title="Tổng số suất" value={daily?.total ?? 0} />
            <Statistic title="Giá suất" value={daily?.menu ? vnd(daily.menu.price) : '—'} />
          </Space>
          {daily && !daily.menu && <Alert type="warning" showIcon message="Chưa có thực đơn cho ngày này" style={{ marginBottom: 12 }} />}
          <Table<any>
            rowKey={(r) => r.classId ?? 'none'}
            size="small"
            loading={dailyLoading}
            dataSource={daily?.byClass}
            pagination={false}
            columns={[
              { title: 'Lớp', dataIndex: 'className' },
              { title: 'Số suất', dataIndex: 'count', width: 100, align: 'right' },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={14}>
        <Card
          title="Tổng hợp tiền ăn theo tháng"
          extra={
            <Space wrap>
              <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={month} onChange={(d) => d && setMonth(d)} />
              <Select placeholder="Tất cả lớp" allowClear options={classes?.map((c) => ({ value: c.id, label: c.name }))} style={{ width: 130 }} onChange={setClassId} />
            </Space>
          }
        >
          <Table<any>
            rowKey="studentId"
            size="small"
            loading={monthlyLoading}
            dataSource={monthly?.items}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Lớp', dataIndex: 'className', width: 80 },
              { title: 'Mã HS', dataIndex: 'code', width: 110 },
              { title: 'Họ và tên', dataIndex: 'fullName' },
              { title: 'Số suất', dataIndex: 'meals', width: 80, align: 'right' },
              { title: 'Thành tiền', dataIndex: 'cost', width: 130, align: 'right', render: vnd },
            ]}
            summary={() =>
              monthly?.items.length ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <b>Tổng cộng ({monthly.totals.students} học sinh)</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <b>{monthly.totals.meals}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <b>{vnd(monthly.totals.cost)}</b>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null
            }
          />
        </Card>
      </Col>
    </Row>
  );
}

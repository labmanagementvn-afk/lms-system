'use client';

import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Progress, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const percent = (used: number, limit: number) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : used ? 100 : 0);

/** Hạn mức: SMS used and left per class this month; the principal sets the brandname, the defaults and each class's own limit. */
export function QuotaTab() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const admin = me?.role === 'ADMIN';
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const { data, isLoading, mutate } = useSWR<any>(['/sms/usage', { month }]);
  const { data: settings, mutate: mutateSettings } = useSWR<any>(['/sms/settings']);
  const [form] = Form.useForm();
  const [limits, setLimits] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (settings) form.setFieldsValue({ brandname: settings.brandname ?? '', classMonthlyQuota: settings.classMonthlyQuota, schoolMonthlyQuota: settings.schoolMonthlyQuota });
  }, [settings, form]);

  async function saveSettings() {
    try {
      const v = await form.validateFields();
      await api('/sms/settings', { method: 'PUT', body: { ...v, brandname: v.brandname?.trim() || null } });
      message.success('Đã lưu cấu hình tin nhắn');
      mutateSettings();
      mutate();
    } catch (e) {
      if (!(e as any)?.errorFields) message.error((e as Error).message);
    }
  }

  async function setLimit(classId: string, monthlyLimit: number | null) {
    try {
      await api(`/sms/quotas/${classId}`, { method: 'PUT', body: { monthlyLimit } });
      message.success(monthlyLimit === null ? 'Đã dùng lại hạn mức chung' : 'Đã lưu hạn mức của lớp');
      setLimits(({ [classId]: _, ...rest }) => rest);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={admin ? 16 : 24}>
        <Space wrap style={{ marginBottom: 12 }}>
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(d) => d && setMonth(d.format('YYYY-MM'))} />
          {data && <Typography.Text type="secondary">Đã dùng {data.used} SMS trong tháng</Typography.Text>}
        </Space>
        {data?.school && (
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space size="large" wrap>
              <Statistic title="Quỹ tin chung (gửi giáo viên, cán bộ)" value={data.school.used} suffix={`/ ${data.school.limit} SMS`} />
              <Progress type="circle" size={64} percent={percent(data.school.used, data.school.limit)} status={data.school.remaining ? 'normal' : 'exception'} />
            </Space>
          </Card>
        )}
        <Table<any>
          rowKey="classId"
          size="small"
          loading={isLoading}
          dataSource={data?.classes}
          pagination={false}
          columns={[
            { title: 'Lớp', dataIndex: 'name', width: 80, render: (v) => <b>{v}</b> },
            { title: 'Giáo viên chủ nhiệm', dataIndex: 'homeroomTeacher' },
            {
              title: 'Hạn mức tháng',
              width: admin ? 230 : 120,
              render: (_, c) =>
                admin ? (
                  <Space size={4}>
                    <InputNumber
                      size="small"
                      min={0}
                      max={100000}
                      style={{ width: 90 }}
                      value={limits[c.classId] ?? c.limit}
                      onChange={(v) => setLimits((l) => ({ ...l, [c.classId]: v }))}
                    />
                    {limits[c.classId] !== undefined && limits[c.classId] !== c.limit && (
                      <Tooltip title="Lưu hạn mức riêng của lớp">
                        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => setLimit(c.classId, limits[c.classId] ?? 0)} aria-label="Lưu" />
                      </Tooltip>
                    )}
                    {c.custom ? (
                      <Tooltip title={`Về hạn mức chung (${data.classMonthlyQuota} SMS)`}>
                        <Button size="small" icon={<UndoOutlined />} onClick={() => setLimit(c.classId, null)} aria-label="Về hạn mức chung" />
                      </Tooltip>
                    ) : (
                      <Tag>chung</Tag>
                    )}
                  </Space>
                ) : (
                  <>
                    {c.limit} {c.custom ? <Tag color="gold">riêng</Tag> : null}
                  </>
                ),
            },
            { title: 'Đã dùng', dataIndex: 'used', width: 80, align: 'right' },
            { title: 'Còn lại', dataIndex: 'remaining', width: 80, align: 'right', render: (v) => <Typography.Text type={v ? undefined : 'danger'}>{v}</Typography.Text> },
            { title: '', width: 160, render: (_, c) => <Progress size="small" percent={percent(c.used, c.limit)} status={c.remaining ? 'normal' : 'exception'} /> },
          ]}
        />
      </Col>
      {admin && (
        <Col xs={24} xl={8}>
          <Card size="small" title="Cấu hình gửi tin">
            <Form form={form} layout="vertical">
              <Form.Item
                name="brandname"
                label="Tên thương hiệu (brandname)"
                tooltip="Tên người gửi đã đăng ký với nhà mạng, tối đa 11 ký tự không dấu"
                rules={[{ max: 11 }, { pattern: /^[A-Za-z0-9 ._-]*$/, message: 'Chỉ gồm chữ cái không dấu, số, dấu cách, dấu chấm và gạch' }]}
              >
                <Input placeholder="THCS DEMO" />
              </Form.Item>
              <Form.Item name="classMonthlyQuota" label="Hạn mức mỗi lớp mỗi tháng (SMS)" rules={[{ required: true }]}>
                <InputNumber min={0} max={100000} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="schoolMonthlyQuota" label="Quỹ tin chung mỗi tháng (SMS)" tooltip="Dùng cho tin nhắn gửi giáo viên, cán bộ" rules={[{ required: true }]}>
                <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
              </Form.Item>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Nhà cung cấp: {settings?.provider ?? 'chưa cấu hình'}. Tin lỗi không tính vào hạn mức; tin hẹn giờ tính vào tháng gửi.
              </Typography.Paragraph>
              <Button type="primary" icon={<SaveOutlined />} onClick={saveSettings}>
                Lưu cấu hình
              </Button>
            </Form>
          </Card>
        </Col>
      )}
    </Row>
  );
}

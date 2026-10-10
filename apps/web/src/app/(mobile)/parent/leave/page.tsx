'use client';

import { SendOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Empty, Form, Input, List, Popconfirm, Segmented, Spin, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ABSENCE_STATUS, leaveDays } from '@/lib/labels';
import { useParent } from '@/lib/parent';
import { todayIn } from '@/lib/time';

/** Matches the API: a parent may ask for days off from a week back. */
const LOOKBACK_DAYS = 7;

/** Đơn xin nghỉ học: the parent asks, the homeroom teacher approves, the roll call shows it as "có phép". */
export default function ParentLeavePage() {
  const tz = useAuth().me!.school.timezone;
  const { message } = App.useApp();
  const { child, loading } = useParent();
  const { data, isLoading, mutate } = useSWR<{ requests: any[] }>(child ? [`/parent/children/${child.id}/absences`] : null);
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const today = dayjs(todayIn(tz));

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  async function send(v: { fromDate: Dayjs; toDate?: Dayjs; session: string; reason: string }) {
    setSending(true);
    try {
      const to = v.toDate ?? v.fromDate;
      await api(`/parent/children/${child!.id}/absences`, {
        method: 'POST',
        body: { fromDate: v.fromDate.format('YYYY-MM-DD'), toDate: to.format('YYYY-MM-DD'), session: v.session || undefined, reason: v.reason.trim() },
      });
      message.success('Đã gửi đơn. Giáo viên chủ nhiệm sẽ xem và duyệt.');
      form.resetFields();
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/parent/absences/${id}/cancel`, { method: 'POST' });
      message.success('Đã rút đơn');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography.Text strong>Xin nghỉ học · {child.fullName}</Typography.Text>

      {child.class ? (
        <Card size="small" title="Gửi đơn xin nghỉ">
          <Form form={form} layout="vertical" onFinish={send} initialValues={{ fromDate: today, session: '' }} requiredMark={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Form.Item name="fromDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày' }]} style={{ marginBottom: 12 }}>
                <DatePicker
                  format="DD/MM/YYYY"
                  inputReadOnly
                  style={{ width: '100%' }}
                  allowClear={false}
                  disabledDate={(d) => d.isBefore(today.subtract(LOOKBACK_DAYS, 'day'), 'day')}
                  onChange={(d) => {
                    const to: Dayjs | undefined = form.getFieldValue('toDate');
                    if (d && to && to.isBefore(d, 'day')) form.setFieldValue('toDate', undefined);
                  }}
                />
              </Form.Item>
              <Form.Item name="toDate" label="Đến ngày" style={{ marginBottom: 12 }}>
                <DatePicker
                  format="DD/MM/YYYY"
                  inputReadOnly
                  placeholder="Nghỉ 1 ngày"
                  style={{ width: '100%' }}
                  disabledDate={(d) => d.isBefore(form.getFieldValue('fromDate') ?? today, 'day')}
                />
              </Form.Item>
            </div>
            <Form.Item name="session" label="Buổi" style={{ marginBottom: 12 }}>
              <Segmented
                block
                options={[
                  { value: '', label: 'Cả ngày' },
                  { value: 'MORNING', label: 'Buổi sáng' },
                  { value: 'AFTERNOON', label: 'Buổi chiều' },
                ]}
              />
            </Form.Item>
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do xin nghỉ' }]} style={{ marginBottom: 12 }}>
              <Input.TextArea rows={2} maxLength={500} placeholder="Con bị sốt, gia đình xin cho con nghỉ để đi khám" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending} block>
              Gửi đơn cho giáo viên chủ nhiệm
            </Button>
          </Form>
        </Card>
      ) : (
        <Card size="small">
          <Typography.Text type="secondary">Con chưa được xếp lớp năm học này nên chưa gửi được đơn xin nghỉ.</Typography.Text>
        </Card>
      )}

      <Card size="small" title="Đơn đã gửi" styles={{ body: { padding: '0 12px' } }}>
        <List
          loading={isLoading}
          dataSource={data?.requests ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đơn xin nghỉ" /> }}
          renderItem={(r) => (
            <List.Item
              style={{ padding: '10px 0', alignItems: 'flex-start' }}
              extra={
                r.status === 'PENDING' && (
                  <Popconfirm title="Rút đơn xin nghỉ này?" okText="Rút đơn" cancelText="Không" onConfirm={() => cancel(r.id)}>
                    <Button size="small">Rút đơn</Button>
                  </Popconfirm>
                )
              }
            >
              <List.Item.Meta
                title={
                  <span>
                    {leaveDays(r)} <Tag color={ABSENCE_STATUS[r.status].color}>{ABSENCE_STATUS[r.status].label}</Tag>
                  </span>
                }
                description={
                  <>
                    <div style={{ color: '#1f2937' }}>{r.reason}</div>
                    {r.decisionNote && <div>Giáo viên ghi chú: {r.decisionNote}</div>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Gửi ngày {new Date(r.createdAt).toLocaleDateString('vi-VN', { timeZone: tz })}
                      {r.requestedBy && r.requestedBy.role !== 'PARENT' ? ` · ${r.requestedBy.fullName} ghi nhận` : ''}
                      {r.decidedBy && r.status !== 'PENDING' && r.status !== 'CANCELLED' ? ` · ${r.decidedBy.fullName} ${r.status === 'APPROVED' ? 'duyệt' : 'xử lý'}` : ''}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

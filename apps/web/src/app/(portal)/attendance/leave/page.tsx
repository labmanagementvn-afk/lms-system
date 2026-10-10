'use client';

import { CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Form, Input, Modal, Radio, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { ABSENCE_STATUS, leaveDays, ROLE } from '@/lib/labels';
import { formatTime, todayIn } from '@/lib/time';

/** Đơn xin nghỉ học: parents' requests from the app, decided by the homeroom teacher. */
export default function LeaveRequestsPage() {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { message, modal } = App.useApp();
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const { data, isLoading, mutate } = useSWR<any[]>(['/homeroom/absences', { classId, status }]);
  const [recording, setRecording] = useState(false);
  const [form] = Form.useForm();
  const recordClass = Form.useWatch('classId', form);
  const roster = useSWR<{ items: any[] }>(recordClass ? ['/students', { classId: recordClass, status: 'STUDYING', pageSize: 100 }] : null);

  // Teachers see and decide the requests of the classes they are homeroom teacher of.
  const classOptions = useMemo(
    () => (classes ?? []).filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId).map((c) => ({ value: c.id, label: c.name })),
    [classes, isTeacher, me?.teacherId],
  );
  const waiting = (data ?? []).filter((r) => r.status === 'PENDING').length;

  function decide(r: any, approve: boolean) {
    let note = '';
    modal.confirm({
      title: approve ? `Duyệt đơn xin nghỉ của ${r.student.fullName}?` : `Không duyệt đơn xin nghỉ của ${r.student.fullName}?`,
      content: (
        <>
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            {leaveDays(r)}. Lý do: {r.reason}
          </Typography.Paragraph>
          {approve && <Typography.Paragraph type="secondary">Các buổi đã điểm danh vắng trong những ngày này được chuyển thành vắng có phép.</Typography.Paragraph>}
          <Input.TextArea rows={2} placeholder="Ghi chú gửi phụ huynh (không bắt buộc)" onChange={(e) => (note = e.target.value)} maxLength={500} />
        </>
      ),
      okText: approve ? 'Duyệt' : 'Không duyệt',
      okButtonProps: { danger: !approve },
      cancelText: 'Đóng',
      onOk: async () => {
        try {
          const res = await api(`/homeroom/absences/${r.id}/decide`, { method: 'POST', body: { approve, note: note.trim() || undefined } });
          message.success(approve ? `Đã duyệt${res.excused ? `, ${res.excused} buổi vắng chuyển thành có phép` : ''}` : 'Đã từ chối đơn');
          mutate();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  }

  async function record() {
    const v = await form.validateFields();
    try {
      await api('/homeroom/absences', {
        method: 'POST',
        body: { studentId: v.studentId, fromDate: v.days[0].format('YYYY-MM-DD'), toDate: v.days[1].format('YYYY-MM-DD'), session: v.session || undefined, reason: v.reason.trim() },
      });
      message.success('Đã ghi nhận đơn xin nghỉ');
      setRecording(false);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Đơn xin nghỉ học"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ classId: classId ?? classOptions[0]?.value, days: [dayjs(todayIn(tz)), dayjs(todayIn(tz))], session: '' });
              setRecording(true);
            }}
            disabled={!classOptions.length}
          >
            Ghi nhận đơn
          </Button>
        }
      />
      {waiting > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${waiting} đơn đang chờ duyệt`} />}
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder={isTeacher ? 'Lớp chủ nhiệm' : 'Tất cả các lớp'} allowClear showSearch optionFilterProp="label" style={{ width: 160 }} value={classId} onChange={setClassId} options={classOptions} />
        <Select placeholder="Trạng thái" allowClear style={{ width: 150 }} value={status} onChange={setStatus} options={Object.entries(ABSENCE_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </Space>
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={[
          { title: 'Học sinh', render: (_, r) => <Link href={`/students/${r.student.id}`}>{r.student.fullName}</Link> },
          { title: 'Lớp', width: 70, render: (_, r) => r.class.name },
          { title: 'Ngày nghỉ', width: 230, render: (_, r) => leaveDays(r) },
          { title: 'Lý do', dataIndex: 'reason' },
          {
            title: 'Người gửi',
            width: 190,
            render: (_, r) => (
              <>
                {r.requestedBy?.fullName} <Typography.Text type="secondary">({ROLE[r.requestedBy?.role] ?? ''})</Typography.Text>
                <div style={{ color: '#64748b', fontSize: 12 }}>
                  {dayjs(r.createdAt).format('DD/MM')} {formatTime(r.createdAt, tz)}
                </div>
              </>
            ),
          },
          {
            title: 'Trạng thái',
            width: 200,
            render: (_, r) => (
              <>
                <Tag color={ABSENCE_STATUS[r.status].color}>{ABSENCE_STATUS[r.status].label}</Tag>
                {r.decidedBy && r.status !== 'PENDING' && <div style={{ color: '#64748b', fontSize: 12 }}>{r.decidedBy.fullName}</div>}
                {r.decisionNote && <div style={{ fontSize: 12 }}>{r.decisionNote}</div>}
              </>
            ),
          },
          {
            title: '',
            width: 100,
            render: (_, r) =>
              r.status === 'PENDING' && (
                <Space>
                  <Tooltip title="Duyệt">
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => decide(r, true)} aria-label="Duyệt" />
                  </Tooltip>
                  <Tooltip title="Không duyệt">
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => decide(r, false)} aria-label="Không duyệt" />
                  </Tooltip>
                </Space>
              ),
          },
        ]}
      />
      <Modal title="Ghi nhận đơn xin nghỉ" open={recording} onOk={record} onCancel={() => setRecording(false)} okText="Ghi nhận" cancelText="Hủy" destroyOnHidden>
        <Typography.Paragraph type="secondary">Đơn phụ huynh báo qua điện thoại hoặc gửi giấy được duyệt ngay khi ghi nhận; phụ huynh nhận được thông báo.</Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Space.Compact block>
            <Form.Item name="classId" label="Lớp" style={{ width: 120 }}>
              <Select options={classOptions} onChange={() => form.setFieldValue('studentId', undefined)} />
            </Form.Item>
            <Form.Item name="studentId" label="Học sinh" rules={[{ required: true, message: 'Chọn học sinh' }]} style={{ flex: 1 }}>
              <Select showSearch optionFilterProp="label" loading={roster.isLoading} options={(roster.data?.items ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
            </Form.Item>
          </Space.Compact>
          <Space wrap align="start">
            <Form.Item name="days" label="Ngày nghỉ" rules={[{ required: true, message: 'Chọn ngày nghỉ' }]}>
              <DatePicker.RangePicker format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="session" label="Buổi">
              <Radio.Group
                optionType="button"
                options={[
                  { value: '', label: 'Cả ngày' },
                  { value: 'MORNING', label: 'Sáng' },
                  { value: 'AFTERNOON', label: 'Chiều' },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Nhập lý do' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Phụ huynh gọi điện báo con bị ốm" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

'use client';

import { EditOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Divider, Drawer, Form, Input, InputNumber, Space, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { APPLICATION_SOURCE, APPLICATION_STATUS, GENDER, RELATIONSHIP } from '@/lib/labels';
import { ApplicationFormModal } from './ApplicationFormModal';
import { EnrolModal } from './EnrolModal';
import { fmtDate, fmtDateTime, STATUS_ACTIONS } from './shared';

/** Full detail of one application with screening, status moves and enrolment. */
export function ApplicationDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { message, modal } = App.useApp();
  const { data: a, mutate } = useSWR<any>(id ? [`/admissions/applications/${id}`] : null);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<any | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (a) form.setFieldsValue({ score: a.score ?? undefined, screeningNote: a.screeningNote ?? undefined });
  }, [a, form]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      mutate();
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveScreening() {
    const values = await form.validateFields();
    await act(() => api(`/admissions/applications/${id}`, { method: 'PATCH', body: clean(values) }), 'Đã lưu kết quả xét tuyển');
  }

  function move(action: { to: string; label: string; needsNote?: boolean }) {
    const label = APPLICATION_STATUS[action.to].label;
    if (!action.needsNote) {
      return act(() => api(`/admissions/applications/${id}/status`, { method: 'POST', body: { status: action.to } }), `Đã chuyển sang "${label}"`);
    }
    let note = '';
    modal.confirm({
      title: `${action.label}: ${a.fullName}?`,
      content: <Input.TextArea placeholder="Lý do / ghi chú (không bắt buộc)" onChange={(e) => (note = e.target.value)} />,
      okText: action.label,
      okButtonProps: { danger: true },
      cancelText: 'Đóng',
      onOk: () => act(() => api(`/admissions/applications/${id}/status`, { method: 'POST', body: clean({ status: action.to, note }) }), `Đã chuyển sang "${label}"`),
    });
  }

  const status = a && APPLICATION_STATUS[a.status];
  const actions = a ? (STATUS_ACTIONS[a.status] ?? []) : [];
  const editable = a && a.status !== 'ENROLLED';
  const overCapacity = a?.round?.capacity && a.round.acceptedCount >= a.round.capacity;

  return (
    <Drawer open={!!id} onClose={onClose} width={640} title={a ? `${a.code} · ${a.fullName}` : 'Hồ sơ'} destroyOnHidden>
      {a && (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Tag color={status.color} style={{ fontSize: 14, padding: '2px 10px' }}>
              {status.label}
            </Tag>
            <Tag>{APPLICATION_SOURCE[a.source]}</Tag>
            <Typography.Text type="secondary">Nộp lúc {fmtDateTime(a.submittedAt)}</Typography.Text>
          </Space>
          {a.status === 'ENROLLED' && a.student && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                <>
                  Đã nhập học lớp {a.class?.name}, mã học sinh <Link href={`/students?q=${a.student.code}`}>{a.student.code}</Link>
                </>
              }
            />
          )}
          <Descriptions
            size="small"
            column={2}
            bordered
            title="Học sinh"
            extra={
              editable && (
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(a)}>
                  Sửa thông tin
                </Button>
              )
            }
          >
            <Descriptions.Item label="Họ và tên">{a.fullName}</Descriptions.Item>
            <Descriptions.Item label="Giới tính">{a.gender ? GENDER[a.gender] : ''}</Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">{fmtDate(a.dateOfBirth)}</Descriptions.Item>
            <Descriptions.Item label="Trường cũ">{a.previousSchool}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>
              {a.address}
            </Descriptions.Item>
            <Descriptions.Item label="Đợt tuyển sinh" span={2}>
              {a.round.name} (khối {a.round.gradeLevel})
            </Descriptions.Item>
          </Descriptions>
          <Descriptions size="small" column={2} bordered title="Phụ huynh" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Họ và tên">{a.guardianName}</Descriptions.Item>
            <Descriptions.Item label="Quan hệ">{RELATIONSHIP[a.guardianRelationship]}</Descriptions.Item>
            <Descriptions.Item label="Điện thoại">{a.guardianPhone}</Descriptions.Item>
            <Descriptions.Item label="Email">{a.guardianEmail}</Descriptions.Item>
            {a.notes && (
              <Descriptions.Item label="Ghi chú của phụ huynh" span={2}>
                {a.notes}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider orientation="left" plain>
            Xét tuyển
          </Divider>
          <Form form={form} layout="vertical" disabled={!editable}>
            <Space align="start" wrap>
              <Form.Item name="score" label="Điểm">
                <InputNumber min={0} max={1000} step={0.5} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item name="screeningNote" label="Ghi chú xét tuyển" style={{ minWidth: 360 }}>
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Space>
            {editable && (
              <Button onClick={saveScreening} loading={busy}>
                Lưu kết quả
              </Button>
            )}
          </Form>

          {(actions.length > 0 || a.status === 'ACCEPTED') && (
            <>
              <Divider orientation="left" plain>
                Xử lý hồ sơ
              </Divider>
              {a.status === 'SCREENING' && overCapacity && <Alert type="warning" showIcon message={`Đợt tuyển sinh đã đủ chỉ tiêu (${a.round.acceptedCount}/${a.round.capacity}); vẫn có thể xét trúng tuyển.`} style={{ marginBottom: 12 }} />}
              <Space wrap>
                {a.status === 'ACCEPTED' && (
                  <Button type="primary" onClick={() => setEnrolling(true)} loading={busy}>
                    Nhập học
                  </Button>
                )}
                {actions.map((x) => (
                  <Button key={x.to} danger={x.danger} type={x.to === 'ACCEPTED' || x.to === 'SCREENING' ? 'primary' : 'default'} onClick={() => move(x)} loading={busy}>
                    {x.label}
                  </Button>
                ))}
              </Space>
            </>
          )}
        </>
      )}
      <ApplicationFormModal
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          mutate();
          onChanged();
        }}
      />
      <EnrolModal
        open={enrolling}
        count={1}
        gradeLevel={a?.round?.gradeLevel}
        onClose={() => setEnrolling(false)}
        onSubmit={async (classId) => {
          await act(() => api(`/admissions/applications/${id}/enrol`, { method: 'POST', body: { classId } }), 'Đã nhập học, hồ sơ học sinh đã được tạo');
          setEnrolling(false);
        }}
      />
    </Drawer>
  );
}

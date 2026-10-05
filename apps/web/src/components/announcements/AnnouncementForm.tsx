'use client';

import { SaveOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, DatePicker, Divider, Drawer, Form, Input, Radio, Select, Space, Switch } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { NOTIFICATION_CHANNEL, ROLE, options } from '@/lib/labels';
import { describeRoles } from './format';

type Preview = { recipients: number; byRole: Record<string, number> };

/** Create / edit drawer: saves a draft (or a scheduled send), previews the audience, or sends right away. */
export function AnnouncementForm({ open, initial, onClose, onSaved }: { open: boolean; initial: any | null; onClose: () => void; onSaved: () => void }) {
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const [form] = Form.useForm();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'draft' | 'preview' | 'send' | null>(null);
  const kind = Form.useWatch('kind', form);
  const scheduled = Form.useWatch('scheduled', form);

  // Teachers may only address the classes they are homeroom teacher of.
  const classOptions = (classes ?? []).filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }));
  const grades = [...new Set((classes ?? []).map((c) => c.gradeLevel as number))].sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    setSavedId(initial?.id ?? null);
    setPreview(null);
    form.resetFields();
    form.setFieldsValue(
      initial
        ? {
            kind: initial.kind,
            title: initial.title,
            body: initial.body,
            eventAt: initial.eventAt ? dayjs(initial.eventAt) : undefined,
            location: initial.location ?? '',
            rsvp: initial.rsvp,
            roles: initial.audience.roles,
            classIds: initial.audience.classIds,
            gradeLevels: initial.audience.gradeLevels,
            channels: initial.channels.filter((c: string) => c !== 'IN_APP'),
            scheduled: !!initial.scheduledAt,
            scheduledAt: initial.scheduledAt ? dayjs(initial.scheduledAt) : undefined,
          }
        : { kind: 'ANNOUNCEMENT', rsvp: false, roles: isTeacher ? [] : ['PARENT'], classIds: [], gradeLevels: [], channels: [], scheduled: false },
    );
  }, [open, initial, form, isTeacher]);

  /** The request body; on an update, null clears the event fields and the schedule. */
  function payload(v: any, forUpdate: boolean) {
    const body: Record<string, unknown> = {
      kind: v.kind,
      title: v.title,
      body: v.body,
      rsvp: v.kind === 'EVENT' ? !!v.rsvp : false,
      audience: { roles: isTeacher ? [] : (v.roles ?? []), classIds: v.classIds ?? [], gradeLevels: isTeacher ? [] : (v.gradeLevels ?? []) },
      channels: ['IN_APP', ...(v.channels ?? [])],
    };
    if (v.kind === 'EVENT') {
      body.eventAt = v.eventAt.toISOString();
      if (v.location?.trim()) body.location = v.location.trim();
      else if (forUpdate) body.location = null;
    } else if (forUpdate) {
      body.eventAt = null;
      body.location = null;
    }
    if (v.scheduled && v.scheduledAt) body.scheduledAt = v.scheduledAt.toISOString();
    else if (forUpdate) body.scheduledAt = null;
    return body;
  }

  /** Creates or updates the announcement and returns its id. */
  async function persist(): Promise<string> {
    const v = await form.validateFields();
    const res = savedId
      ? await api(`/announcements/${savedId}`, { method: 'PATCH', body: payload(v, true) })
      : await api('/announcements', { method: 'POST', body: payload(v, false) });
    setSavedId(res.id);
    return res.id;
  }

  async function run(action: 'draft' | 'preview' | 'send') {
    setBusy(action);
    try {
      const id = await persist();
      if (action === 'draft') {
        message.success(scheduled ? 'Đã lưu và hẹn giờ gửi' : 'Đã lưu nháp');
        onSaved();
        onClose();
        return;
      }
      const p = (await api(`/announcements/${id}/preview`, { method: 'POST' })) as Preview;
      setPreview(p);
      if (action === 'send') {
        modal.confirm({
          title: 'Gửi thông báo ngay?',
          content: `Sẽ gửi tới ${p.recipients} người (${describeRoles(p.byRole)}).`,
          okText: 'Gửi',
          cancelText: 'Hủy',
          onOk: async () => {
            try {
              await api(`/announcements/${id}/send`, { method: 'POST' });
              message.success('Đã gửi thông báo');
              onSaved();
              onClose();
            } catch (e) {
              message.error((e as Error).message);
            }
          },
        });
      }
    } catch (e) {
      // validateFields rejects with the failed fields; the form already shows them.
      if (!(e as any)?.errorFields) message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={680}
      destroyOnHidden
      title={initial?.id ? 'Sửa thông báo' : 'Tạo thông báo'}
      footer={
        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button icon={<TeamOutlined />} onClick={() => run('preview')} loading={busy === 'preview'}>
            Xem số người nhận
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => run('draft')} loading={busy === 'draft'}>
            {scheduled ? 'Lưu & hẹn giờ' : 'Lưu nháp'}
          </Button>
          <Button type="primary" icon={<SendOutlined />} onClick={() => run('send')} loading={busy === 'send'}>
            Gửi ngay
          </Button>
        </Space>
      }
    >
      {preview && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`${preview.recipients} người sẽ nhận thông báo này`} description={describeRoles(preview.byRole)} />}
      <Form form={form} layout="vertical">
        <Form.Item name="kind" label="Loại">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'ANNOUNCEMENT', label: 'Thông báo' },
              { value: 'EVENT', label: 'Sự kiện' },
            ]}
          />
        </Form.Item>
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }, { max: 200 }]}>
          <Input placeholder="Họp phụ huynh đầu năm" />
        </Form.Item>
        <Form.Item name="body" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung' }, { max: 5000 }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
        {kind === 'EVENT' && (
          <Space wrap align="start">
            <Form.Item name="eventAt" label="Thời gian diễn ra" rules={[{ required: true, message: 'Chọn thời gian' }]}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" minuteStep={5} />
            </Form.Item>
            <Form.Item name="location" label="Địa điểm" rules={[{ max: 255 }]}>
              <Input placeholder="Phòng P.101" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="rsvp" label="Xác nhận tham dự" valuePropName="checked" tooltip="Người nhận chọn Tham dự / Không / Chưa chắc">
              <Switch />
            </Form.Item>
          </Space>
        )}

        <Divider orientation="left" plain>
          Đối tượng nhận
        </Divider>
        {!isTeacher && (
          <Form.Item name="roles" label="Theo vai trò (mọi tài khoản đang hoạt động)">
            <Checkbox.Group options={options(ROLE)} />
          </Form.Item>
        )}
        <Space wrap align="start">
          <Form.Item
            name="classIds"
            label={isTeacher ? 'Lớp chủ nhiệm' : 'Theo lớp (phụ huynh và GVCN)'}
            rules={isTeacher ? [{ required: true, message: 'Chọn lớp' }] : []}
          >
            <Select mode="multiple" style={{ width: 300 }} optionFilterProp="label" placeholder="Chọn lớp" options={classOptions} />
          </Form.Item>
          {!isTeacher && (
            <Form.Item name="gradeLevels" label="Theo khối (phụ huynh và GVCN)">
              <Select mode="multiple" style={{ width: 200 }} placeholder="Chọn khối" options={grades.map((g) => ({ value: g, label: `Khối ${g}` }))} />
            </Form.Item>
          )}
        </Space>

        <Divider orientation="left" plain>
          Kênh gửi
        </Divider>
        <Form.Item name="channels" extra="Thông báo trong ứng dụng luôn được gửi; các kênh khác chỉ gửi khi trường đã bật trong Thiết lập.">
          <Checkbox.Group
            options={Object.entries(NOTIFICATION_CHANNEL)
              .filter(([value]) => value !== 'IN_APP')
              .map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>

        <Divider orientation="left" plain>
          Hẹn giờ
        </Divider>
        <Space wrap align="start">
          <Form.Item name="scheduled" label="Hẹn giờ gửi" valuePropName="checked">
            <Switch />
          </Form.Item>
          {scheduled && (
            <Form.Item name="scheduledAt" label="Thời điểm gửi" rules={[{ required: true, message: 'Chọn thời điểm gửi' }]}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" minuteStep={5} />
            </Form.Item>
          )}
        </Space>
      </Form>
    </Drawer>
  );
}

'use client';

import { ClockCircleOutlined, EyeOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Col, DatePicker, Empty, Form, Input, Radio, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses } from '@/lib/hooks';
import { fillSample, smsLength, toPlain } from '@/lib/sms';

/** A text handed over from the templates tab. */
export interface SmsDraft {
  audience: 'PARENT' | 'TEACHER';
  title: string;
  body: string;
}

interface QuotaRow {
  classId: string | null;
  name: string;
  limit: number;
  used: number;
  needed: number;
  remaining: number;
  over: boolean;
}

interface Preview {
  recipients: number;
  segments: number;
  longest: number;
  maxSegments: number;
  tooLong: number;
  skipped: { name: string; className?: string; reason: string }[];
  samples: { name: string; phone: string; studentName: string | null; className: string | null; text: string; segments: number }[];
  label: string;
  month: string;
  quota: QuotaRow[];
  overQuota: boolean;
}

const monthLabel = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

/** Soạn tin: pick the recipients, write (or pick a template), check the cost against the quota, send now or later. */
export function ComposeTab({ draft, onSent }: { draft: SmsDraft | null; onSent: () => void }) {
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const isTeacher = me?.role === 'TEACHER';
  const { data: settings } = useSWR<any>(['/sms/settings']);
  const { data: classes } = useClasses();
  const { data: teachers } = useAllTeachers();
  const [form] = Form.useForm();
  const audience: 'PARENT' | 'TEACHER' = Form.useWatch('audience', form) ?? 'PARENT';
  const body: string = Form.useWatch('body', form) ?? '';
  const accented: boolean = Form.useWatch('accented', form) ?? false;
  const scheduled: boolean = Form.useWatch('scheduled', form) ?? false;
  const allTeachers: boolean = Form.useWatch('allTeachers', form) ?? false;
  const { data: templates } = useSWR<any[]>(['/sms/templates', { audience }]);
  const [studentQ, setStudentQ] = useState('');
  const { data: found } = useSWR<{ items: any[] }>(audience === 'PARENT' ? ['/students', { q: studentQ, pageSize: 20, status: 'STUDYING' }] : null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const bodyRef = useRef<TextAreaRef>(null);

  // Teachers text the parents of their own homeroom classes only.
  const ownClasses = useMemo(() => (classes ?? []).filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId), [classes, isTeacher, me?.teacherId]);
  const ownIds = useMemo(() => new Set(ownClasses.map((c) => c.id)), [ownClasses]);
  const studentOptions = (found?.items ?? [])
    .filter((s) => !isTeacher || ownIds.has(s.enrollments?.[0]?.class?.id))
    .map((s) => ({ value: s.id, label: `${s.fullName} (${s.enrollments?.[0]?.class?.name ?? s.code})` }));

  useEffect(() => {
    form.setFieldsValue({ audience: 'PARENT', classIds: [], students: [], teacherIds: [], allTeachers: false, accented: false, scheduled: false });
  }, [form]);

  useEffect(() => {
    if (!draft) return;
    form.setFieldsValue({ audience: isTeacher ? 'PARENT' : draft.audience, title: draft.title, body: draft.body });
    setPreview(null);
  }, [draft, form, isTeacher]);

  const placeholders: Record<string, string> = settings?.placeholders?.[audience] ?? {};
  const estimate = smsLength(fillSample(body, { truong: me?.school.name ?? '' }), accented);
  const maxSegments: number = settings?.maxSegments ?? 4;

  function insert(name: string) {
    const el = bodyRef.current?.resizableTextArea?.textArea;
    const token = `{${name}}`;
    const at = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? at;
    form.setFieldValue('body', body.slice(0, at) + token + body.slice(end));
    setPreview(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  }

  function payload(v: any) {
    const base = { audience: v.audience, body: v.body, accented: !!v.accented, scheduledAt: v.scheduled && v.scheduledAt ? v.scheduledAt.toISOString() : undefined };
    return v.audience === 'TEACHER'
      ? { ...base, allTeachers: !!v.allTeachers, teacherIds: v.allTeachers ? [] : (v.teacherIds ?? []) }
      : { ...base, classIds: v.classIds ?? [], studentIds: (v.students ?? []).map((s: { value: string }) => s.value) };
  }

  async function check(): Promise<{ v: any; p: Preview } | null> {
    const v = await form.validateFields();
    const p = await api<Preview>('/sms/preview', { method: 'POST', body: payload(v) });
    setPreview(p);
    return { v, p };
  }

  async function run(action: 'preview' | 'send') {
    setBusy(action);
    try {
      const r = await check();
      if (!r || action === 'preview') return;
      const { v, p } = r;
      if (!p.recipients) return void message.error('Không có người nhận nào có số điện thoại hợp lệ');
      if (p.overQuota) return void message.error('Vượt hạn mức tin nhắn, xem chi tiết bên phải');
      if (p.tooLong) return void message.error(`Tin nhắn dài quá ${p.maxSegments} SMS, hãy rút gọn nội dung`);
      const when = v.scheduled && v.scheduledAt ? v.scheduledAt.format('HH:mm DD/MM/YYYY') : null;
      modal.confirm({
        title: when ? `Hẹn gửi lúc ${when}?` : 'Gửi tin nhắn ngay?',
        content: `${p.label}: ${p.recipients} người nhận, ${p.segments} SMS${p.skipped.length ? `. ${p.skipped.length} người chưa có số điện thoại sẽ không nhận được.` : '.'}`,
        okText: when ? 'Hẹn giờ' : 'Gửi',
        cancelText: 'Hủy',
        onOk: async () => {
          try {
            const c = await api('/sms/campaigns', { method: 'POST', body: { ...payload(v), title: v.title } });
            message.success(c.status === 'SCHEDULED' ? 'Đã hẹn giờ gửi tin nhắn' : `Đã gửi ${c.counts.SUCCESS}/${c.recipients} tin nhắn`);
            form.setFieldsValue({ title: undefined, body: '', classIds: [], students: [], teacherIds: [], allTeachers: false, scheduled: false, scheduledAt: undefined });
            setPreview(null);
            onSent();
          } catch (e) {
            message.error((e as Error).message);
          }
        },
      });
    } catch (e) {
      if (!(e as any)?.errorFields) message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={13}>
        <Card size="small">
          {settings && !settings.provider && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Chưa cấu hình nhà cung cấp SMS; tin nhắn sẽ không gửi đi được." />}
          <Form form={form} layout="vertical" onValuesChange={(changed) => !('title' in changed) && setPreview(null)}>
            {!isTeacher && (
              <Form.Item name="audience" label="Gửi tới">
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { value: 'PARENT', label: 'Phụ huynh học sinh' },
                    { value: 'TEACHER', label: 'Giáo viên, cán bộ' },
                  ]}
                />
              </Form.Item>
            )}
            {audience === 'PARENT' ? (
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="classIds" label={isTeacher ? 'Lớp chủ nhiệm' : 'Cả lớp'} tooltip="Phụ huynh của mọi học sinh đang học trong lớp">
                    <Select mode="multiple" allowClear optionFilterProp="label" placeholder="Chọn lớp" options={ownClasses.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="students" label="Hoặc từng học sinh">
                    <Select mode="multiple" labelInValue allowClear showSearch filterOption={false} onSearch={setStudentQ} placeholder="Tìm theo tên hoặc mã" options={studentOptions} />
                  </Form.Item>
                </Col>
              </Row>
            ) : (
              <Space align="start" wrap>
                <Form.Item name="allTeachers" valuePropName="checked" label=" ">
                  <Checkbox>Toàn bộ giáo viên</Checkbox>
                </Form.Item>
                {!allTeachers && (
                  <Form.Item name="teacherIds" label="Giáo viên" style={{ minWidth: 320 }}>
                    <Select mode="multiple" allowClear optionFilterProp="label" placeholder="Chọn giáo viên" options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})` }))} />
                  </Form.Item>
                )}
              </Space>
            )}
            <Form.Item name="title" label="Tiêu đề (để tra cứu, không gửi đi)" rules={[{ required: true, message: 'Nhập tiêu đề' }, { max: 120 }]}>
              <Input placeholder="Họp phụ huynh cuối học kỳ I" />
            </Form.Item>
            <Form.Item label="Mẫu tin nhắn" style={{ marginBottom: 8 }}>
              <Select
                allowClear
                placeholder="Chọn mẫu để điền nội dung"
                value={null}
                options={(templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
                onChange={(id) => {
                  const t = templates?.find((x) => x.id === id);
                  if (!t) return;
                  form.setFieldsValue({ body: t.body, title: form.getFieldValue('title') || t.name });
                  setPreview(null);
                }}
                notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có mẫu" />}
              />
            </Form.Item>
            <Form.Item
              name="body"
              label="Nội dung"
              rules={[{ required: true, message: 'Nhập nội dung tin nhắn' }, { max: 1000 }]}
              extra={
                <Space direction="vertical" size={4} style={{ marginTop: 4, width: '100%' }}>
                  <Space size={[4, 4]} wrap>
                    <Typography.Text type="secondary">Chèn:</Typography.Text>
                    {Object.entries(placeholders).map(([name, label]) => (
                      <Tag key={name} color="processing" style={{ cursor: 'pointer' }} onClick={() => insert(name)}>
                        {label}
                      </Tag>
                    ))}
                  </Space>
                  <Typography.Text type={estimate.segments > maxSegments ? 'danger' : 'secondary'}>
                    Khoảng {estimate.chars} ký tự, {estimate.segments} SMS mỗi người nhận ({accented ? '70 ký tự có dấu' : '160 ký tự không dấu'} một SMS; tối đa {maxSegments} SMS)
                  </Typography.Text>
                </Space>
              }
            >
              <Input.TextArea ref={bodyRef} rows={5} placeholder="Kính gửi phụ huynh em {hoc_sinh} lớp {lop}: ..." />
            </Form.Item>
            {!accented && body.trim() && (
              <Alert type="info" style={{ marginBottom: 12 }} message="Tin nhắn không dấu sẽ gửi đi như sau" description={toPlain(fillSample(body.trim(), { truong: me?.school.name ?? '' }))} />
            )}
            <Space wrap align="start">
              <Form.Item name="accented" label="Gửi có dấu" valuePropName="checked" tooltip="Có dấu: 70 ký tự một SMS; không dấu: 160 ký tự">
                <Switch />
              </Form.Item>
              <Form.Item name="scheduled" label="Hẹn giờ gửi" valuePropName="checked">
                <Switch />
              </Form.Item>
              {scheduled && (
                <Form.Item name="scheduledAt" label="Thời điểm gửi" rules={[{ required: true, message: 'Chọn thời điểm gửi' }]}>
                  <DatePicker
                    showTime={{ format: 'HH:mm', minuteStep: 5 }}
                    format="HH:mm DD/MM/YYYY"
                    disabledDate={(d) => d.isBefore(dayjs(), 'day') || d.isAfter(dayjs().add(settings?.maxAheadDays ?? 90, 'day'))}
                  />
                </Form.Item>
              )}
            </Space>
            <Space wrap>
              <Button icon={<EyeOutlined />} onClick={() => run('preview')} loading={busy === 'preview'}>
                Xem trước
              </Button>
              <Button type="primary" icon={scheduled ? <ClockCircleOutlined /> : <SendOutlined />} onClick={() => run('send')} loading={busy === 'send'}>
                {scheduled ? 'Hẹn giờ gửi' : 'Gửi ngay'}
              </Button>
            </Space>
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={11}>
        <Card size="small" title="Xem trước">
          {!preview ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn người nhận, nhập nội dung rồi bấm Xem trước" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type={preview.overQuota || preview.tooLong ? 'error' : 'success'}
                showIcon
                message={`${preview.label}: ${preview.recipients} người nhận, ${preview.segments} SMS`}
                description={
                  preview.overQuota
                    ? `Vượt hạn mức tháng ${monthLabel(preview.month)}; giảm số người nhận hoặc nhờ quản trị tăng hạn mức.`
                    : preview.tooLong
                      ? `${preview.tooLong} tin dài quá ${preview.maxSegments} SMS; hãy rút gọn nội dung.`
                      : `Tin dài nhất: ${preview.longest} SMS.`
                }
              />
              <Table<QuotaRow>
                size="small"
                rowKey={(q) => q.classId ?? 'school'}
                pagination={false}
                dataSource={preview.quota}
                columns={[
                  { title: `Hạn mức tháng ${monthLabel(preview.month)}`, dataIndex: 'name' },
                  { title: 'Hạn mức', dataIndex: 'limit', align: 'right' },
                  { title: 'Đã dùng', dataIndex: 'used', align: 'right' },
                  { title: 'Lần này', dataIndex: 'needed', align: 'right' },
                  { title: 'Còn lại', align: 'right', render: (_, q) => <Typography.Text type={q.over ? 'danger' : undefined}>{q.remaining}</Typography.Text> },
                ]}
              />
              <Typography.Text strong>Tin mẫu</Typography.Text>
              {preview.samples.map((s) => (
                <Card key={s.phone + s.text} size="small" styles={{ body: { padding: 10 } }}>
                  <Space size={4} wrap style={{ marginBottom: 4 }}>
                    <Typography.Text strong>{s.name}</Typography.Text>
                    {s.studentName && <Typography.Text type="secondary">PH em {s.studentName}{s.className ? `, lớp ${s.className}` : ''}</Typography.Text>}
                    <Tag>{s.phone}</Tag>
                    <Tag color={s.segments > preview.maxSegments ? 'red' : 'blue'}>{s.segments} SMS</Tag>
                  </Space>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{s.text}</div>
                </Card>
              ))}
              {preview.skipped.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`${preview.skipped.length} người sẽ không nhận được tin`}
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.skipped.slice(0, 10).map((s) => (
                        <li key={s.name + (s.className ?? '')}>
                          {s.name}
                          {s.className ? ` (${s.className})` : ''}: {s.reason}
                        </li>
                      ))}
                      {preview.skipped.length > 10 && <li>và {preview.skipped.length - 10} người khác</li>}
                    </ul>
                  }
                />
              )}
            </Space>
          )}
        </Card>
      </Col>
    </Row>
  );
}

'use client';

import { CloudUploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Drawer, Form, Input, Radio, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { formatDateTime } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAcademicYears } from '@/lib/hooks';
import { MOET_EXPORT_KIND, MOET_SYNC_STATUS, MOET_TARGET, SEMESTER } from '@/lib/labels';

/** Đồng bộ trực tiếp: submit records to CSDL ngành or the Sở with the school's account, and the history of submissions. */
export function MoetSyncTab() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const years = useAcademicYears();
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<any>(['/moet/sync', { page, pageSize: 20 }]);
  const [form] = Form.useForm();
  const target: string = Form.useWatch('target', form) ?? 'MOET';
  const kind: string = Form.useWatch('kind', form) ?? 'STUDENTS';
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Fill in the account last used for the chosen database; the password is never kept.
  useEffect(() => {
    if (data?.lastUsername && !form.isFieldTouched('username')) form.setFieldValue('username', data.lastUsername[target] ?? '');
  }, [data?.lastUsername, target, form]);

  async function submit() {
    try {
      const v = await form.validateFields();
      setBusy(true);
      const r = await api('/moet/sync', { method: 'POST', body: { ...v, semester: v.kind === 'TERM_RESULTS' ? v.semester : undefined } });
      form.setFieldValue('password', '');
      if (r.status === 'SUCCESS') message.success(`Đã gửi ${r.accepted}/${r.total} bản ghi, số lô ${r.externalRef}`);
      else if (r.status === 'PARTIAL') message.warning(`Đã nhận ${r.accepted}/${r.total} bản ghi; ${r.rejected} bản ghi bị từ chối`);
      else message.error(r.error ?? 'Gửi dữ liệu thất bại');
      mutate();
      if (r.rejected) setOpenId(r.id);
    } catch (e) {
      if (!(e as any)?.errorFields) message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={9}>
        <Card size="small" title="Gửi dữ liệu">
          {data?.provider?.startsWith('mock') && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Môi trường thử nghiệm"
              description="Hệ thống chưa kết nối với CSDL ngành thật; dữ liệu chỉ được kiểm tra như khi gửi thật. Không nhập mật khẩu thật của trường."
            />
          )}
          <Form form={form} layout="vertical" initialValues={{ target: 'MOET', kind: 'STUDENTS', semester: 1 }}>
            <Form.Item name="target" label="Gửi tới">
              <Radio.Group options={Object.entries(MOET_TARGET).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="kind" label="Dữ liệu">
              <Select options={Object.entries(MOET_EXPORT_KIND).map(([value, k]) => ({ value, label: k.label }))} />
            </Form.Item>
            {kind !== 'TEACHERS' && (
              <Space wrap>
                <Form.Item name="academicYearId" label="Năm học">
                  <Select
                    style={{ width: 170 }}
                    placeholder="Năm học hiện tại"
                    allowClear
                    options={(years.data ?? []).map((y: any) => ({ value: y.id, label: y.name + (y.isCurrent ? ' (hiện tại)' : '') }))}
                  />
                </Form.Item>
                {kind === 'TERM_RESULTS' && (
                  <Form.Item name="semester" label="Học kỳ">
                    <Select style={{ width: 120 }} options={[1, 2, 0].map((s) => ({ value: s, label: SEMESTER[s] }))} />
                  </Form.Item>
                )}
              </Space>
            )}
            <Form.Item name="username" label="Tài khoản CSDL" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
              <Input autoComplete="off" placeholder="Tài khoản của trường trên CSDL ngành" />
            </Form.Item>
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]} extra="Chỉ dùng cho lần gửi này, không được lưu lại.">
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" icon={<CloudUploadOutlined />} loading={busy} onClick={submit}>
              Gửi dữ liệu
            </Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={15}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Lịch sử gửi dữ liệu
        </Typography.Title>
        <Table<any>
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={data?.items}
          scroll={{ x: 760 }}
          pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: 'Chưa gửi dữ liệu lần nào' }}
          columns={[
            { title: 'Thời gian', width: 140, render: (_, s) => formatDateTime(s.startedAt, tz) },
            { title: 'Gửi tới', width: 120, render: (_, s) => MOET_TARGET[s.target] },
            { title: 'Dữ liệu', render: (_, s) => `${MOET_EXPORT_KIND[s.kind]?.label ?? s.kind}${s.semester !== null ? ` · ${SEMESTER[s.semester]}` : ''}${s.academicYear ? ` · ${s.academicYear}` : ''}` },
            { title: 'Nhận / Tổng', width: 100, align: 'right', render: (_, s) => `${s.accepted}/${s.total}` },
            {
              title: 'Kết quả',
              width: 150,
              render: (_, s) => (
                <>
                  <Tag color={MOET_SYNC_STATUS[s.status].color}>{MOET_SYNC_STATUS[s.status].label}</Tag>
                  {s.rejected > 0 && (
                    <Typography.Link style={{ fontSize: 12 }} onClick={() => setOpenId(s.id)}>
                      {s.rejected} bị từ chối
                    </Typography.Link>
                  )}
                  {s.error && !s.rejected && <div style={{ fontSize: 12, color: '#dc2626' }}>{s.error}</div>}
                </>
              ),
            },
            { title: 'Người gửi', width: 130, render: (_, s) => <Typography.Link onClick={() => setOpenId(s.id)}>{s.createdBy}</Typography.Link> },
          ]}
        />
      </Col>
      <SyncDrawer id={openId} onClose={() => setOpenId(null)} />
    </Row>
  );
}

function SyncDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { data: s } = useSWR<any>(id ? [`/moet/sync/${id}`] : null);
  return (
    <Drawer open={!!id} onClose={onClose} width={760} title="Lần gửi dữ liệu" destroyOnHidden>
      {s && (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Gửi tới">{MOET_TARGET[s.target]}</Descriptions.Item>
            <Descriptions.Item label="Dữ liệu">{MOET_EXPORT_KIND[s.kind]?.label}</Descriptions.Item>
            <Descriptions.Item label="Thời gian">{formatDateTime(s.startedAt, tz)}</Descriptions.Item>
            <Descriptions.Item label="Người gửi">{s.createdBy}</Descriptions.Item>
            <Descriptions.Item label="Tài khoản">{s.username}</Descriptions.Item>
            <Descriptions.Item label="Số lô">{s.externalRef ?? ''}</Descriptions.Item>
            <Descriptions.Item label="Kết quả">
              <Tag color={MOET_SYNC_STATUS[s.status].color}>{MOET_SYNC_STATUS[s.status].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Bản ghi">
              {s.accepted} nhận / {s.total} gửi
            </Descriptions.Item>
            {s.error && (
              <Descriptions.Item label="Lỗi" span={2}>
                {s.error}
              </Descriptions.Item>
            )}
          </Descriptions>
          {s.errors.length > 0 && (
            <Table<any>
              rowKey="row"
              size="small"
              dataSource={s.errors}
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              columns={[
                { title: 'Dòng', dataIndex: 'row', width: 60, align: 'center' },
                { title: 'Mã', dataIndex: 'code', width: 110 },
                { title: 'Tên', dataIndex: 'name', width: 200 },
                { title: 'Lý do từ chối', dataIndex: 'message' },
              ]}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

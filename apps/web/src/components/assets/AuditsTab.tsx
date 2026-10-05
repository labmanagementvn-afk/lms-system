'use client';

import { CheckOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Drawer, Form, Input, Modal, Popconfirm, Radio, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { AuditStatusTag, employeeLabel, fmtDate, isoDate } from './shared';

export function AuditsTab({ onChanged }: { onChanged?: () => void }) {
  const [query, setQuery] = useState({ page: 1, pageSize: 20 });
  const { data, isLoading, mutate } = useSWR<any>(['/assets/audits', query]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Mở đợt kiểm kê
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Đợt kiểm kê', dataIndex: 'name' },
          { title: 'Ngày', dataIndex: 'date', width: 110, render: fmtDate },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (s) => <AuditStatusTag status={s} /> },
          { title: 'Đã kiểm', dataIndex: 'checked', width: 90, align: 'right' },
          { title: 'Có mặt', dataIndex: 'found', width: 90, align: 'right', render: (n) => <Typography.Text type="success">{n}</Typography.Text> },
          { title: 'Thiếu', dataIndex: 'missing', width: 90, align: 'right', render: (n) => (n ? <Typography.Text type="danger">{n}</Typography.Text> : n) },
          {
            title: '',
            width: 90,
            render: (_, r) => (
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setOpenId(r.id)}>
                Mở
              </Button>
            ),
          },
        ]}
      />
      <AuditModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(audit) => {
          mutate();
          setOpenId(audit.id);
        }}
      />
      <AuditDrawer
        auditId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          mutate();
          onChanged?.();
        }}
      />
    </>
  );
}

function AuditModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (audit: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ date: dayjs(), name: `Kiểm kê ${dayjs().format('MM/YYYY')}` });
    }
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      const audit = await api('/assets/audits', { method: 'POST', body: { name: values.name, date: isoDate(values.date) } });
      message.success(`Đã mở đợt kiểm kê cho ${audit.counts.total} tài sản`);
      onClose();
      onSaved(audit);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title="Mở đợt kiểm kê" open={open} onOk={save} onCancel={onClose} okText="Mở" cancelText="Hủy" forceRender>
      <Typography.Paragraph type="secondary">Mọi tài sản chưa thanh lý sẽ được đưa vào danh sách kiểm kê.</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tên đợt" rules={[{ required: true, message: 'Nhập tên đợt kiểm kê' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="date" label="Ngày kiểm kê" rules={[{ required: true }]}>
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Stocktake sheet: every asset in scope with its check result, editable until the audit is closed. */
export function AuditDrawer({ auditId, onClose, onChanged }: { auditId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
  const { data: audit, mutate } = useSWR<any>(auditId ? [`/assets/audits/${auditId}`] : null);
  const [report, setReport] = useState<any | null>(null);
  const closed = audit?.status === 'CLOSED';

  async function saveItem(assetId: string, body: { found: boolean; condition?: string; note?: string }) {
    try {
      await api(`/assets/audits/${auditId}/items/${assetId}`, { method: 'PUT', body });
      mutate();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  }

  async function closeAudit() {
    try {
      const r = await api(`/assets/audits/${auditId}/close`, { method: 'POST' });
      setReport(r);
      mutate();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Drawer
      title={
        audit ? (
          <Space>
            <span>
              {audit.name} · {fmtDate(audit.date)}
            </span>
            <AuditStatusTag status={audit.status} />
          </Space>
        ) : (
          'Kiểm kê'
        )
      }
      open={!!auditId}
      onClose={onClose}
      width={1000}
      extra={
        audit &&
        !closed && (
          <Popconfirm title="Chốt đợt kiểm kê? Sau khi chốt sẽ không sửa được kết quả." onConfirm={closeAudit} okText="Chốt" cancelText="Hủy">
            <Button type="primary" icon={<CheckOutlined />}>
              Chốt kiểm kê
            </Button>
          </Popconfirm>
        )
      }
    >
      {audit && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Tổng tài sản" value={audit.counts.total} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Có mặt" value={audit.counts.found} valueStyle={{ color: '#3f8600' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Thiếu" value={audit.counts.missing} valueStyle={{ color: audit.counts.missing ? '#cf1322' : undefined }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="Chưa kiểm" value={audit.counts.unchecked} valueStyle={{ color: audit.counts.unchecked ? '#d46b08' : undefined }} />
              </Card>
            </Col>
          </Row>
          <Table<any>
            rowKey="assetId"
            size="small"
            pagination={false}
            dataSource={audit.items}
            columns={[
              { title: 'Mã', width: 100, render: (_, r) => r.asset.code },
              { title: 'Tài sản', render: (_, r) => r.asset.name },
              { title: 'Vị trí', width: 120, render: (_, r) => r.asset.location },
              { title: 'Người quản lý', width: 180, render: (_, r) => (r.asset.custodian ? employeeLabel(r.asset.custodian) : '') },
              { title: 'Kết quả kiểm kê', width: 480, render: (_, r) => <AuditRow row={r} disabled={closed} onSave={(body) => saveItem(r.assetId, body)} /> },
            ]}
          />
        </>
      )}
      <Modal title="Biên bản kiểm kê" open={!!report} onCancel={() => setReport(null)} footer={<Button onClick={() => setReport(null)}>Đóng</Button>}>
        {report && (
          <>
            <Typography.Paragraph>
              <b>{report.name}</b> ({fmtDate(report.date)}) đã chốt: {report.total} tài sản, {report.found} có mặt, {report.missing.length} thiếu, {report.unchecked} chưa kiểm.
            </Typography.Paragraph>
            {report.missing.length > 0 && (
              <Table<any>
                rowKey="assetId"
                size="small"
                pagination={false}
                dataSource={report.missing}
                columns={[
                  { title: 'Mã', width: 100, render: (_, r) => r.asset.code },
                  { title: 'Tài sản thiếu', render: (_, r) => r.asset.name },
                  { title: 'Ghi chú', dataIndex: 'note' },
                ]}
              />
            )}
          </>
        )}
      </Modal>
    </Drawer>
  );
}

/** One asset's check: found / missing plus condition and note, saved per row. */
function AuditRow({ row, disabled, onSave }: { row: any; disabled: boolean; onSave: (body: { found: boolean; condition?: string; note?: string }) => Promise<void> }) {
  const [found, setFound] = useState<boolean | null>(row.found);
  const [condition, setCondition] = useState<string>(row.condition ?? '');
  const [note, setNote] = useState<string>(row.note ?? '');
  const [saving, setSaving] = useState(false);

  // Resync only when the server's values change, so typing in one row survives another row's save.
  useEffect(() => {
    setFound(row.found);
    setCondition(row.condition ?? '');
    setNote(row.note ?? '');
  }, [row.found, row.condition, row.note]);

  const dirty = found !== row.found || condition !== (row.condition ?? '') || note !== (row.note ?? '');

  async function save(nextFound: boolean | null = found) {
    if (nextFound === null) return;
    setSaving(true);
    try {
      await onSave({ found: nextFound, ...(condition.trim() ? { condition: condition.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    } catch {
      // the drawer already showed the error
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space wrap>
      <Radio.Group
        size="small"
        optionType="button"
        buttonStyle="solid"
        disabled={disabled || saving}
        value={found === null ? undefined : found ? 'FOUND' : 'MISSING'}
        onChange={(e) => {
          const next = e.target.value === 'FOUND';
          setFound(next);
          save(next);
        }}
        options={[
          { value: 'FOUND', label: 'Có mặt' },
          { value: 'MISSING', label: 'Thiếu' },
        ]}
      />
      {found === null && <Tag>Chưa kiểm</Tag>}
      <Input size="small" placeholder="Tình trạng" value={condition} disabled={disabled} onChange={(e) => setCondition(e.target.value)} onPressEnter={() => save()} style={{ width: 120 }} />
      <Input size="small" placeholder="Ghi chú" value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} onPressEnter={() => save()} style={{ width: 170 }} />
      {!disabled && (
        <Button size="small" type={dirty ? 'primary' : 'default'} loading={saving} disabled={found === null || !dirty} onClick={() => save()}>
          Lưu
        </Button>
      )}
    </Space>
  );
}

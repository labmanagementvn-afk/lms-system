'use client';

import { CheckCircleOutlined, DeleteOutlined, EditOutlined, ExportOutlined, ImportOutlined, ToolOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Row, Space, Statistic, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, clean } from '@/lib/api';
import { vnd } from '@/lib/labels';
import { AssetModal } from './AssetModal';
import { AssetStatusTag, AuditStatusTag, EmployeeSelect, employeeLabel, fmtDate, fmtDateTime, isoDate, MoneyInput } from './shared';

/** One asset: details, book value and depreciation, repairs, loans and audit history. */
export function AssetDrawer({ assetId, onClose, onChanged }: { assetId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
  const { data: a, mutate } = useSWR<any>(assetId ? [`/assets/${assetId}`] : null);
  const [editing, setEditing] = useState<any | null>(null);
  const [lending, setLending] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [disposing, setDisposing] = useState(false);

  function changed() {
    mutate();
    onChanged?.();
  }

  async function post(path: string, ok: string) {
    try {
      await api(path, { method: 'POST' });
      message.success(ok);
      changed();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const active = a && a.status !== 'DISPOSED';
  const latestRepair = a?.maintenance?.[0];

  return (
    <Drawer
      title={
        a ? (
          <Space>
            <span>
              {a.code} · {a.name}
            </span>
            <AssetStatusTag status={a.status} />
          </Space>
        ) : (
          'Tài sản'
        )
      }
      open={!!assetId}
      onClose={onClose}
      width={900}
      extra={
        a && (
          <Space wrap>
            {active && (
              <Button icon={<EditOutlined />} onClick={() => setEditing(a)}>
                Sửa
              </Button>
            )}
            {active && a.status !== 'LENT' && (
              <Button icon={<ExportOutlined />} onClick={() => setLending(true)}>
                Cho mượn
              </Button>
            )}
            {a.openLoan && (
              <Popconfirm title="Xác nhận đã nhận lại tài sản?" onConfirm={() => post(`/assets/loans/${a.openLoan.id}/return`, 'Đã nhận lại tài sản')}>
                <Button icon={<ImportOutlined />}>Nhận lại</Button>
              </Popconfirm>
            )}
            {active && (
              <Button icon={<ToolOutlined />} onClick={() => setRepairing(true)}>
                Ghi bảo trì
              </Button>
            )}
            {a.status === 'UNDER_MAINTENANCE' && latestRepair && (
              <Popconfirm title="Sửa chữa xong, đưa tài sản về trạng thái đang sử dụng?" onConfirm={() => post(`/assets/maintenance/${latestRepair.id}/complete`, 'Đã hoàn tất sửa chữa')}>
                <Button icon={<CheckCircleOutlined />}>Hoàn tất sửa chữa</Button>
              </Popconfirm>
            )}
            {active && a.status !== 'LENT' && (
              <Button danger icon={<DeleteOutlined />} onClick={() => setDisposing(true)}>
                Thanh lý
              </Button>
            )}
          </Space>
        )
      }
    >
      {a && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Nguyên giá" value={a.purchasePrice ?? 0} formatter={(v) => vnd(Number(v))} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Giá trị còn lại" value={a.bookValue ?? 0} formatter={(v) => (a.bookValue == null ? '—' : vnd(Number(v)))} valueStyle={{ color: '#1677ff' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Khấu hao" value={a.depreciationYears} suffix="năm" />
              </Card>
            </Col>
          </Row>
          <Descriptions
            size="small"
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            items={[
              { label: 'Danh mục', children: a.category?.name },
              { label: 'Nhà cung cấp', children: a.supplier?.name },
              { label: 'Số serial', children: a.serialNumber },
              { label: 'Ngày mua', children: fmtDate(a.purchaseDate) },
              { label: 'Vị trí', children: a.location },
              { label: 'Người quản lý', children: a.custodian ? employeeLabel(a.custodian) : '' },
              ...(a.disposedAt ? [{ label: 'Ngày thanh lý', children: fmtDate(a.disposedAt) }] : []),
              { label: 'Ghi chú', children: <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.notes}</Typography.Paragraph>, span: 2 },
            ]}
          />
          <Tabs
            items={[
              {
                key: 'depreciation',
                label: 'Bảng khấu hao',
                children: (
                  <Table<any>
                    rowKey="year"
                    size="small"
                    pagination={false}
                    dataSource={a.schedule}
                    locale={{ emptyText: 'Cần có ngày mua, nguyên giá và số năm khấu hao' }}
                    columns={[
                      { title: 'Năm', dataIndex: 'year', width: 100 },
                      { title: 'Khấu hao trong năm', dataIndex: 'depreciation', align: 'right', render: vnd },
                      { title: 'Giá trị còn lại cuối năm', dataIndex: 'bookValueEnd', align: 'right', render: vnd },
                    ]}
                  />
                ),
              },
              {
                key: 'maintenance',
                label: `Bảo trì (${a.maintenance.length})`,
                children: (
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={a.maintenance}
                    columns={[
                      { title: 'Ngày', dataIndex: 'date', width: 110, render: fmtDate },
                      { title: 'Nội dung', dataIndex: 'description' },
                      { title: 'Đơn vị sửa', dataIndex: 'vendor', width: 180 },
                      { title: 'Chi phí', dataIndex: 'cost', width: 130, align: 'right', render: (v) => (v != null ? vnd(v) : '') },
                      { title: 'Bảo trì tiếp', dataIndex: 'nextDueDate', width: 110, render: fmtDate },
                    ]}
                  />
                ),
              },
              {
                key: 'loans',
                label: `Mượn trả (${a.loans.length})`,
                children: (
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={a.loans}
                    columns={[
                      { title: 'Người mượn', render: (_, r) => (r.borrower ? employeeLabel(r.borrower) : r.borrowerName) },
                      { title: 'Bộ phận', dataIndex: 'department', width: 140 },
                      { title: 'Mượn lúc', dataIndex: 'lentAt', width: 140, render: fmtDateTime },
                      { title: 'Hạn trả', dataIndex: 'dueAt', width: 110, render: fmtDate },
                      { title: 'Đã trả', dataIndex: 'returnedAt', width: 140, render: (d) => (d ? fmtDateTime(d) : <Tag color="blue">Chưa trả</Tag>) },
                      { title: 'Ghi chú', dataIndex: 'note' },
                    ]}
                  />
                ),
              },
              {
                key: 'audits',
                label: `Kiểm kê (${a.auditItems.length})`,
                children: (
                  <Table<any>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={a.auditItems}
                    columns={[
                      { title: 'Đợt kiểm kê', render: (_, r) => r.audit.name },
                      { title: 'Ngày', width: 110, render: (_, r) => fmtDate(r.audit.date) },
                      { title: 'Đợt', width: 120, render: (_, r) => <AuditStatusTag status={r.audit.status} /> },
                      { title: 'Kết quả', dataIndex: 'found', width: 100, render: (f) => (f ? <Tag color="green">Có mặt</Tag> : <Tag color="red">Thiếu</Tag>) },
                      { title: 'Tình trạng', dataIndex: 'condition', width: 140 },
                      { title: 'Ghi chú', dataIndex: 'note' },
                    ]}
                  />
                ),
              },
            ]}
          />
          <AssetModal record={editing} onClose={() => setEditing(null)} onSaved={changed} />
          <LoanModal asset={a} open={lending} onClose={() => setLending(false)} onSaved={changed} />
          <MaintenanceModal asset={a} open={repairing} onClose={() => setRepairing(false)} onSaved={changed} />
          <DisposeModal asset={a} open={disposing} onClose={() => setDisposing(false)} onSaved={changed} />
        </>
      )}
    </Drawer>
  );
}

function LoanModal({ asset, open, onClose, onSaved }: { asset: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ dueAt: dayjs().add(7, 'day') });
    }
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/assets/${asset.id}/loans`, { method: 'POST', body: clean({ ...values, dueAt: values.dueAt.endOf('day').toISOString() }) });
      message.success('Đã ghi phiếu mượn');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={`Cho mượn: ${asset.name}`} open={open} onOk={save} onCancel={onClose} okText="Cho mượn" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="borrowerEmployeeId" label="Nhân viên mượn">
          <EmployeeSelect style={{ width: '100%' }} />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="borrowerName" label="Hoặc tên người mượn ngoài" tooltip="Bỏ trống nếu đã chọn nhân viên">
            <Input style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="department" label="Bộ phận / tổ">
            <Input style={{ width: 200 }} />
          </Form.Item>
        </Space>
        <Form.Item name="dueAt" label="Hạn trả" rules={[{ required: true, message: 'Chọn hạn trả' }]}>
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function MaintenanceModal({ asset, open, onClose, onSaved }: { asset: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ date: dayjs(), inProgress: asset.status !== 'LENT' });
    }
  }, [form, open, asset]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/assets/${asset.id}/maintenance`, {
        method: 'POST',
        body: clean({ ...values, date: isoDate(values.date), nextDueDate: isoDate(values.nextDueDate), inProgress: !!values.inProgress }),
      });
      message.success('Đã ghi nhận bảo trì');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={`Bảo trì / sửa chữa: ${asset.name}`} open={open} onOk={save} onCancel={onClose} okText="Lưu" cancelText="Hủy" forceRender>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="date" label="Ngày" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="cost" label="Chi phí (₫)">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="nextDueDate" label="Bảo trì tiếp theo">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="description" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung bảo trì' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="vendor" label="Đơn vị sửa chữa">
          <Input />
        </Form.Item>
        <Form.Item name="inProgress" label="Đang đem đi sửa (chuyển trạng thái Đang sửa chữa)" valuePropName="checked">
          <Switch disabled={asset.status === 'LENT'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function DisposeModal({ asset, open, onClose, onSaved }: { asset: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  async function save() {
    const values = await form.validateFields();
    try {
      await api(`/assets/${asset.id}/dispose`, { method: 'POST', body: clean(values) });
      message.success('Đã thanh lý tài sản');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <Modal title={`Thanh lý tài sản ${asset.code}?`} open={open} onOk={save} onCancel={onClose} okText="Thanh lý" okButtonProps={{ danger: true }} cancelText="Hủy" forceRender>
      <Typography.Paragraph>Tài sản sẽ chuyển sang trạng thái Đã thanh lý và không thể sửa hay cho mượn nữa.</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="Lý do / căn cứ">
          <Input.TextArea rows={2} placeholder="Hỏng không sửa được, thanh lý theo QĐ số…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

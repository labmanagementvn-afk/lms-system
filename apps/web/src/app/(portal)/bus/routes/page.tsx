'use client';

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Result, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { StudentSelect } from '@/components/StudentSelect';
import { DirectionTag } from '@/components/bus/tags';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { BUS_DIRECTION, options } from '@/lib/labels';

const BusMap = dynamic(() => import('@/components/bus/BusMap'), { ssr: false, loading: () => <Spin /> });
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function RoutesPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data: routes, isLoading, mutate } = useSWR<any[]>(['/bus/routes']);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (!canEditStudents(me)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Quản lý xe đưa đón dành cho văn phòng nhà trường." />;
  }

  async function remove(id: string) {
    try {
      await api(`/bus/routes/${id}`, { method: 'DELETE' });
      message.success('Đã xóa tuyến');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Tuyến & điểm đón"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Thêm tuyến
          </Button>
        }
      />
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={routes}
        pagination={false}
        scroll={{ x: 1000 }}
        onRow={(r) => ({ onClick: () => setSelected(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Tuyến', dataIndex: 'name', render: (v) => <b>{v}</b> },
          { title: 'Chiều', dataIndex: 'direction', width: 120, render: (d) => <DirectionTag direction={d} /> },
          { title: 'Xuất phát', dataIndex: 'startTime', width: 90 },
          { title: 'Xe', width: 130, render: (_, r) => r.vehicle?.plateNumber ?? <Typography.Text type="secondary">Chưa gán</Typography.Text> },
          { title: 'Lái xe', width: 160, render: (_, r) => r.driver?.fullName ?? <Typography.Text type="secondary">Chưa gán</Typography.Text> },
          { title: 'Phụ xe', width: 160, render: (_, r) => r.monitor?.fullName ?? '' },
          { title: 'Điểm đón', width: 90, align: 'right', render: (_, r) => r.stops.length },
          { title: 'Học sinh', dataIndex: 'studentCount', width: 90, align: 'right' },
          { title: 'Hoạt động', dataIndex: 'isActive', width: 110, render: (v) => (v ? <Tag color="green">Đang chạy</Tag> : <Tag>Tạm dừng</Tag>) },
          {
            title: '',
            width: 60,
            render: (_, r) => (
              <Popconfirm title="Xóa tuyến này?" description="Chỉ xóa được tuyến chưa có chuyến đi." onConfirm={() => remove(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal title="Thêm tuyến" open={creating} footer={null} onCancel={() => setCreating(false)} destroyOnHidden>
        <RouteForm
          onSaved={(r) => {
            setCreating(false);
            mutate();
            setSelected(r.id);
          }}
        />
      </Modal>
      <RouteDrawer id={selected} onClose={() => setSelected(null)} onChanged={() => mutate()} />
    </>
  );
}

/** Create or edit a route's basics: name, direction, start time and crew. */
function RouteForm({ route, onSaved }: { route?: any; onSaved: (route: any) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { data: vehicles } = useSWR<any[]>(['/bus/vehicles']);
  const { data: staff } = useSWR<any[]>(['/bus/staff']);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    form.setFieldsValue(
      route
        ? { name: route.name, direction: route.direction, startTime: route.startTime, vehicleId: route.vehicleId, driverId: route.driverId, monitorId: route.monitorId, isActive: route.isActive }
        : { direction: 'PICKUP', startTime: '06:15', isActive: true },
    );
  }, [form, route]);

  async function save() {
    const values = await form.validateFields();
    const body = { ...values, vehicleId: values.vehicleId ?? null, driverId: values.driverId ?? null, monitorId: values.monitorId ?? null };
    setBusy(true);
    try {
      const saved = route ? await api(`/bus/routes/${route.id}`, { method: 'PATCH', body }) : await api('/bus/routes', { method: 'POST', body });
      message.success('Đã lưu tuyến');
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const crew = (role: string, currentId?: string) =>
    (staff ?? []).filter((s) => s.role === role && (s.isActive || s.id === currentId)).map((s) => ({ value: s.id, label: `${s.fullName} · ${s.phone}` }));

  return (
    <Form form={form} layout="vertical">
      <Form.Item name="name" label="Tên tuyến" rules={[{ required: true, message: 'Nhập tên tuyến' }]}>
        <Input placeholder="Tuyến 1 - Cầu Giấy" />
      </Form.Item>
      <Space wrap>
        <Form.Item name="direction" label="Chiều" rules={[{ required: true }]}>
          <Select options={options(BUS_DIRECTION)} style={{ width: 150 }} />
        </Form.Item>
        <Form.Item name="startTime" label="Giờ xuất phát" rules={[{ required: true, pattern: HHMM, message: 'Dạng HH:mm' }]}>
          <Input placeholder="06:15" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="isActive" label="Đang hoạt động" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Space>
      <Form.Item name="vehicleId" label="Xe">
        <Select
          allowClear
          placeholder="Chọn xe"
          options={(vehicles ?? [])
            .filter((v) => v.status !== 'RETIRED' || v.id === route?.vehicleId)
            .map((v) => ({ value: v.id, label: `${v.plateNumber}${v.model ? ` · ${v.model}` : ''} (${v.capacity} chỗ)` }))}
        />
      </Form.Item>
      <Space wrap style={{ width: '100%' }}>
        <Form.Item name="driverId" label="Lái xe">
          <Select allowClear placeholder="Chọn lái xe" options={crew('DRIVER', route?.driverId)} style={{ width: 240 }} />
        </Form.Item>
        <Form.Item name="monitorId" label="Phụ xe">
          <Select allowClear placeholder="Chọn phụ xe" options={crew('MONITOR', route?.monitorId)} style={{ width: 240 }} />
        </Form.Item>
      </Space>
      <Button type="primary" loading={busy} onClick={save}>
        {route ? 'Lưu thay đổi' : 'Tạo tuyến'}
      </Button>
    </Form>
  );
}

function RouteDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data: route, mutate } = useSWR<any>(id ? [`/bus/routes/${id}`] : null);
  const refresh = () => {
    mutate();
    onChanged();
  };
  return (
    <Drawer open={!!id} onClose={onClose} width={900} title={route ? `${route.name} · ${BUS_DIRECTION[route.direction]}` : 'Tuyến xe'} destroyOnHidden>
      {route && (
        <Tabs
          items={[
            { key: 'stops', label: `Điểm đón (${route.stops.length})`, children: <StopsEditor key={route.id} route={route} onSaved={refresh} /> },
            { key: 'students', label: `Học sinh (${route.studentCount})`, children: <AssignmentsTab route={route} onChanged={refresh} /> },
            { key: 'info', label: 'Thông tin tuyến', children: <RouteForm route={route} onSaved={refresh} /> },
          ]}
        />
      )}
    </Drawer>
  );
}

interface StopRow {
  key: string;
  id?: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  plannedTime?: string | null;
}

const rowsOf = (route: any): StopRow[] => route.stops.map((s: any) => ({ key: s.id, id: s.id, name: s.name, address: s.address, lat: s.lat, lng: s.lng, plannedTime: s.plannedTime }));

/** Ordered stop list with inline editing; saved as a whole with PUT so existing stops keep their id and roster. */
function StopsEditor({ route, onSaved }: { route: any; onSaved: () => void }) {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<StopRow[]>(() => rowsOf(route));
  const [busy, setBusy] = useState(false);
  const stopsKey = JSON.stringify(route.stops);

  useEffect(() => {
    setRows(rowsOf(route));
    // Reset only when the saved stops change, so background refreshes do not clobber edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);

  const update = (key: string, patch: Partial<StopRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = index + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  const add = () => setRows((rs) => [...rs, { key: `new-${Date.now()}`, name: '', lat: null, lng: null }]);

  async function save() {
    for (const [i, r] of rows.entries()) {
      if (!r.name.trim()) return message.warning(`Điểm ${i + 1}: nhập tên điểm đón`);
      if (r.lat === null || r.lat === undefined || r.lng === null || r.lng === undefined) return message.warning(`Điểm ${i + 1}: nhập tọa độ`);
      if (r.plannedTime && !HHMM.test(r.plannedTime)) return message.warning(`Điểm ${i + 1}: giờ dự kiến dạng HH:mm`);
    }
    const removed = route.stops.filter((s: any) => !rows.some((r) => r.id === s.id));
    const doSave = async () => {
      setBusy(true);
      try {
        await api(`/bus/routes/${route.id}/stops`, {
          method: 'PUT',
          body: { stops: rows.map((r) => ({ id: r.id, name: r.name.trim(), address: r.address?.trim() || undefined, lat: r.lat, lng: r.lng, plannedTime: r.plannedTime || undefined })) },
        });
        message.success('Đã lưu điểm đón');
        onSaved();
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    if (removed.length) {
      modal.confirm({
        title: `Xóa ${removed.length} điểm đón?`,
        content: 'Học sinh đang gán tại các điểm bị xóa sẽ bị gỡ khỏi tuyến.',
        okText: 'Xóa và lưu',
        okButtonProps: { danger: true },
        cancelText: 'Hủy',
        onOk: doSave,
      });
    } else await doSave();
  }

  const markers = rows
    .filter((r) => r.lat !== null && r.lat !== undefined && r.lng !== null && r.lng !== undefined)
    .map((r, i) => ({ id: r.key, lat: r.lat as number, lng: r.lng as number, kind: 'stop' as const, label: `${rows.indexOf(r) + 1}. ${r.name || 'Điểm mới'}`, color: i === 0 ? '#16a34a' : undefined }));

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Table<StopRow>
        rowKey="key"
        size="small"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 820 }}
        columns={[
          { title: '#', width: 40, render: (_, __, i) => i + 1 },
          { title: 'Tên điểm đón', render: (_, r) => <Input value={r.name} placeholder="Ngã tư Cầu Giấy" onChange={(e) => update(r.key, { name: e.target.value })} /> },
          { title: 'Địa chỉ', render: (_, r) => <Input value={r.address ?? ''} onChange={(e) => update(r.key, { address: e.target.value })} /> },
          { title: 'Vĩ độ', width: 130, render: (_, r) => <InputNumber value={r.lat} step={0.0001} placeholder="21.0305" style={{ width: 120 }} onChange={(v) => update(r.key, { lat: v })} /> },
          { title: 'Kinh độ', width: 130, render: (_, r) => <InputNumber value={r.lng} step={0.0001} placeholder="105.8012" style={{ width: 120 }} onChange={(v) => update(r.key, { lng: v })} /> },
          { title: 'Giờ dự kiến', width: 100, render: (_, r) => <Input value={r.plannedTime ?? ''} placeholder="06:20" style={{ width: 80 }} onChange={(e) => update(r.key, { plannedTime: e.target.value })} /> },
          {
            title: '',
            width: 110,
            render: (_, r, i) => (
              <Space size={4}>
                <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Lên" />
                <Button size="small" icon={<ArrowDownOutlined />} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Xuống" />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Xóa" />
              </Space>
            ),
          },
        ]}
      />
      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={add}>
          Thêm điểm đón
        </Button>
        <Button type="primary" loading={busy} onClick={save}>
          Lưu điểm đón
        </Button>
        <Typography.Text type="secondary">Thứ tự trong bảng là thứ tự xe đi qua.</Typography.Text>
      </Space>
      {markers.length > 0 && <BusMap markers={markers} track={markers.map((m) => [m.lat, m.lng] as [number, number])} height={320} />}
    </Space>
  );
}

/** Who rides this route and at which stop, for the current academic year. */
function AssignmentsTab({ route, onChanged }: { route: any; onChanged: () => void }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any[]>([`/bus/routes/${route.id}/assignments`]);
  const [studentId, setStudentId] = useState<string>();
  const [stopId, setStopId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const stopOptions = route.stops.map((s: any) => ({ value: s.id, label: `${s.order}. ${s.name}` }));
  const refresh = () => {
    mutate();
    onChanged();
  };
  const current = () => (data ?? []).map((a) => ({ studentId: a.studentId as string, stopId: a.stopId as string }));

  async function put(items: { studentId: string; stopId: string }[]) {
    setBusy(true);
    try {
      await api(`/bus/routes/${route.id}/assignments`, { method: 'PUT', body: { items } });
      refresh();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!studentId || !stopId) return message.warning('Chọn học sinh và điểm đón');
    if (await put([...current().filter((a) => a.studentId !== studentId), { studentId, stopId }])) setStudentId(undefined);
  }

  async function remove(a: any) {
    try {
      await api(`/bus/routes/${route.id}/assignments/${a.studentId}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  if (!route.stops.length) return <Alert type="info" showIcon message="Thêm điểm đón trước khi gán học sinh." />;

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <StudentSelect value={studentId} onChange={setStudentId} style={{ width: 320 }} />
        <Select placeholder="Điểm đón" options={stopOptions} value={stopId} onChange={setStopId} style={{ width: 220 }} />
        <Button type="primary" icon={<PlusOutlined />} loading={busy} onClick={add}>
          Thêm
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Mã HS', width: 120, render: (_, a) => a.student.code },
          { title: 'Họ và tên', render: (_, a) => a.student.fullName },
          { title: 'Lớp', width: 80, render: (_, a) => a.student.class?.name },
          {
            title: 'Điểm đón',
            width: 260,
            render: (_, a) => (
              <Select
                size="small"
                value={a.stopId}
                options={stopOptions}
                style={{ width: 240 }}
                disabled={busy}
                onChange={(v) => put(current().map((x) => (x.studentId === a.studentId ? { ...x, stopId: v } : x)))}
              />
            ),
          },
          {
            title: '',
            width: 50,
            render: (_, a) => (
              <Popconfirm title="Gỡ học sinh khỏi tuyến?" onConfirm={() => remove(a)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Gỡ" />
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  );
}

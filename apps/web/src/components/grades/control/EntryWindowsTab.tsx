'use client';

import { SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Form, InputNumber, Row, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';

interface EntryWindow {
  semester: number;
  opensAt: string | null;
  closesAt: string | null;
  maxEdits: number | null;
}

function windowState(w: EntryWindow) {
  const now = dayjs();
  if (!w.opensAt && !w.closesAt) return <Tag>Không giới hạn thời gian</Tag>;
  if (w.opensAt && now.isBefore(w.opensAt)) return <Tag color="default">Chưa mở</Tag>;
  if (w.closesAt && now.isAfter(w.closesAt)) return <Tag color="red">Đã đóng</Tag>;
  return <Tag color="green">Đang mở</Tag>;
}

/** Thời gian nhập điểm: when teachers may enter marks in each semester, and how often they may change a mark. */
export function EntryWindowsTab({ canEdit }: { canEdit: boolean }) {
  const { data, mutate } = useSWR<EntryWindow[]>(['/grades/entry-windows']);
  return (
    <>
      <Typography.Paragraph type="secondary">
        Giáo viên chỉ nhập và sửa điểm trong thời gian này. Quản trị và giáo vụ vẫn sửa được ngoài thời gian để xử lý trường hợp đặc biệt; mọi lần sửa đều ghi vào thống kê sửa điểm.
      </Typography.Paragraph>
      <Row gutter={16}>
        {(data ?? []).map((w) => (
          <Col xs={24} lg={12} key={w.semester}>
            <WindowCard window={w} canEdit={canEdit} onSaved={() => mutate()} />
          </Col>
        ))}
      </Row>
    </>
  );
}

function WindowCard({ window: w, canEdit, onSaved }: { window: EntryWindow; canEdit: boolean; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ range?: [Dayjs | null, Dayjs | null] | null; maxEdits?: number | null }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue({ range: [w.opensAt ? dayjs(w.opensAt) : null, w.closesAt ? dayjs(w.closesAt) : null], maxEdits: w.maxEdits });
  }, [w, form]);

  async function save() {
    const v = form.getFieldsValue();
    setSaving(true);
    try {
      await api('/grades/entry-windows', {
        method: 'PUT',
        body: { semester: w.semester, opensAt: v.range?.[0]?.toISOString() ?? null, closesAt: v.range?.[1]?.toISOString() ?? null, maxEdits: v.maxEdits ?? null },
      });
      message.success(`Đã lưu thời gian nhập điểm học kỳ ${w.semester}`);
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="small" title={`Học kỳ ${w.semester}`} extra={windowState(w)} style={{ marginBottom: 16 }}>
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.Item name="range" label="Mở và đóng nhập điểm" extra="Bỏ trống một đầu để không giới hạn đầu đó.">
          <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD/MM/YYYY HH:mm" allowEmpty={[true, true]} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="maxEdits" label="Số lần giáo viên được sửa một điểm đã nhập" extra="Bỏ trống để không giới hạn; 0 nghĩa là không được sửa điểm đã nhập.">
          <InputNumber min={0} max={50} placeholder="Không giới hạn" style={{ width: 160 }} />
        </Form.Item>
        {canEdit && (
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
            Lưu
          </Button>
        )}
      </Form>
    </Card>
  );
}

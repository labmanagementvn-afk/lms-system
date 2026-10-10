'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Popconfirm, Radio, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SMS_AUDIENCE } from '@/lib/labels';
import type { SmsDraft } from './ComposeTab';

/** Mẫu tin nhắn: reusable texts with placeholders. The office keeps them; anyone can start a text from one. */
export function TemplatesTab({ onUse }: { onUse: (draft: SmsDraft) => void }) {
  const { message } = App.useApp();
  const { me } = useAuth();
  const office = me?.role !== 'TEACHER';
  const { data: settings } = useSWR<any>(['/sms/settings']);
  const { data, isLoading, mutate } = useSWR<any[]>(['/sms/templates', { audience: office ? undefined : 'PARENT' }]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();
  const audience: 'PARENT' | 'TEACHER' = Form.useWatch('audience', form) ?? 'PARENT';

  function open(t: any | null) {
    setEditing(t ?? {});
    form.resetFields();
    form.setFieldsValue(t ? { name: t.name, audience: t.audience, body: t.body } : { audience: 'PARENT' });
  }

  async function save() {
    try {
      const v = await form.validateFields();
      if (editing?.id) await api(`/sms/templates/${editing.id}`, { method: 'PATCH', body: v });
      else await api('/sms/templates', { method: 'POST', body: v });
      message.success('Đã lưu mẫu tin nhắn');
      setEditing(null);
      mutate();
    } catch (e) {
      if (!(e as any)?.errorFields) message.error((e as Error).message);
    }
  }

  const placeholders: Record<string, string> = settings?.placeholders?.[audience] ?? {};

  return (
    <>
      {office && (
        <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => open(null)}>
          Thêm mẫu
        </Button>
      )}
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Tên mẫu', dataIndex: 'name', width: 220, render: (v) => <b>{v}</b> },
          { title: 'Gửi tới', width: 110, render: (_, t) => <Tag color={t.audience === 'PARENT' ? 'blue' : 'purple'}>{SMS_AUDIENCE[t.audience]}</Tag> },
          { title: 'Nội dung', dataIndex: 'body', render: (v) => <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span> },
          {
            title: '',
            width: office ? 190 : 110,
            render: (_, t) => (
              <Space>
                <Button size="small" icon={<SendOutlined />} onClick={() => onUse({ audience: t.audience, title: t.name, body: t.body })}>
                  Dùng mẫu
                </Button>
                {office && <Button size="small" icon={<EditOutlined />} onClick={() => open(t)} aria-label="Sửa" />}
                {office && (
                  <Popconfirm
                    title="Xóa mẫu này?"
                    okText="Xóa"
                    cancelText="Hủy"
                    onConfirm={async () => {
                      try {
                        await api(`/sms/templates/${t.id}`, { method: 'DELETE' });
                        mutate();
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal open={!!editing} title={editing?.id ? 'Sửa mẫu tin nhắn' : 'Thêm mẫu tin nhắn'} okText="Lưu" cancelText="Hủy" onOk={save} onCancel={() => setEditing(null)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên mẫu" rules={[{ required: true, message: 'Nhập tên mẫu' }, { max: 100 }]}>
            <Input placeholder="Mời họp phụ huynh" />
          </Form.Item>
          <Form.Item name="audience" label="Gửi tới">
            <Radio.Group options={Object.entries(SMS_AUDIENCE).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item
            name="body"
            label="Nội dung"
            rules={[{ required: true, message: 'Nhập nội dung' }, { max: 1000 }]}
            extra={
              <Typography.Text type="secondary">
                Trường thay thế:{' '}
                {Object.entries(placeholders)
                  .map(([name, label]) => `{${name}} ${label.toLowerCase()}`)
                  .join(', ')}
              </Typography.Text>
            }
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

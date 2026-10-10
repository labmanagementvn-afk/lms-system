'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { AutoComplete, Button, DatePicker, Form, Input, Modal, Select, Space, Switch, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { CompletionOverview, CompletionStudent } from '@/components/grades/review/types';

const ROLES = ['Chủ tịch', 'Phó Chủ tịch', 'Thư ký', 'Ủy viên'];
const PRIORITIES = ['Con liệt sĩ', 'Con thương binh', 'Con bệnh binh', 'Người dân tộc thiểu số', 'Hộ nghèo'];

type Round = CompletionOverview['round'];

/** The council of a round: the principal's decision setting it up, the meeting and the members. */
export function CouncilModal({ round, open, busy, onCancel, onSave }: { round: Round; open: boolean; busy: boolean; onCancel: () => void; onSave: (body: unknown) => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      councilDecisionNo: round.councilDecisionNo ?? '',
      councilDecidedOn: round.councilDecidedOn ? dayjs(round.councilDecidedOn.slice(0, 10)) : null,
      meetingAt: round.meetingAt ? dayjs(round.meetingAt) : null,
      meetingPlace: round.meetingPlace ?? '',
      members: round.members.length ? round.members : [{ name: '', position: 'Hiệu trưởng', role: 'Chủ tịch' }],
    });
  }, [open, round, form]);

  async function submit() {
    const v = await form.validateFields();
    onSave({
      councilDecisionNo: v.councilDecisionNo?.trim() || null,
      councilDecidedOn: v.councilDecidedOn ? v.councilDecidedOn.format('YYYY-MM-DD') : null,
      meetingAt: v.meetingAt ? v.meetingAt.toISOString() : null,
      meetingPlace: v.meetingPlace?.trim() || null,
      members: (v.members ?? []).map((m: { name: string; position?: string; role: string }) => ({ name: m.name, position: m.position || undefined, role: m.role })),
    });
  }

  return (
    <Modal title={`Hội đồng xét công nhận · Đợt ${round.round}`} open={open} onCancel={onCancel} onOk={submit} okText="Lưu" cancelText="Hủy" confirmLoading={busy} width={760} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="councilDecisionNo" label="Quyết định thành lập Hội đồng số">
            <Input placeholder="15/QĐ-THCS" style={{ width: 200 }} maxLength={50} />
          </Form.Item>
          <Form.Item name="councilDecidedOn" label="Ngày ký">
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="meetingAt" label="Thời gian họp">
            <DatePicker showTime={{ format: 'HH:mm' }} format="HH:mm DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="meetingPlace" label="Địa điểm họp">
          <Input placeholder="Phòng họp Hội đồng sư phạm" maxLength={200} />
        </Form.Item>
        <Typography.Text strong>Thành viên Hội đồng</Typography.Text>
        <Form.List name="members">
          {(fields, { add, remove }) => (
            <div style={{ marginTop: 8 }}>
              {fields.map((f) => (
                <Space key={f.key} align="start" wrap>
                  <Form.Item name={[f.name, 'name']} rules={[{ required: true, whitespace: true, message: 'Nhập họ tên' }]}>
                    <Input placeholder="Họ và tên" style={{ width: 220 }} maxLength={100} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'position']}>
                    <Input placeholder="Chức vụ" style={{ width: 220 }} maxLength={100} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'role']} rules={[{ required: true, message: 'Chọn nhiệm vụ' }]}>
                    <Select options={ROLES.map((r) => ({ value: r, label: r }))} style={{ width: 140 }} />
                  </Form.Item>
                  <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add({ role: 'Ủy viên' })}>
                Thêm thành viên
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

/** The recognition decision: its number, date and who signs it. */
export function RecognizeModal({ round, eligible, open, busy, onCancel, onSave }: { round: Round; eligible: number; open: boolean; busy: boolean; onCancel: () => void; onSave: (body: unknown) => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (!open) return;
    const chair = round.members.find((m) => m.role.trim().toLowerCase() === 'chủ tịch');
    form.setFieldsValue({ decisionNo: '', decidedOn: dayjs(), signerTitle: 'Chủ tịch Hội đồng', signerName: chair?.name ?? '' });
  }, [open, round, form]);

  async function submit() {
    const v = await form.validateFields();
    onSave({ decisionNo: v.decisionNo, decidedOn: v.decidedOn.format('YYYY-MM-DD'), signerTitle: v.signerTitle?.trim() || undefined, signerName: v.signerName?.trim() || undefined });
  }

  return (
    <Modal title={`Quyết định công nhận · Đợt ${round.round}`} open={open} onCancel={onCancel} onOk={submit} okText={`Công nhận ${eligible} học sinh`} cancelText="Hủy" confirmLoading={busy} destroyOnHidden>
      <Typography.Paragraph type="secondary">
        Mọi học sinh đủ điều kiện trong danh sách được công nhận hoàn thành chương trình giáo dục THCS và đánh số vào sổ. Có thể hủy quyết định của đợt mới nhất để sửa danh sách.
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Space wrap align="start">
          <Form.Item name="decisionNo" label="Quyết định số" rules={[{ required: true, whitespace: true, message: 'Nhập số quyết định' }]}>
            <Input placeholder="25/QĐ-HĐXCN" style={{ width: 200 }} maxLength={50} />
          </Form.Item>
          <Form.Item name="decidedOn" label="Ngày ký" rules={[{ required: true, message: 'Chọn ngày ký' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Space wrap align="start">
          <Form.Item name="signerTitle" label="Chức vụ người ký">
            <Input style={{ width: 200 }} maxLength={100} />
          </Form.Item>
          <Form.Item name="signerName" label="Họ và tên người ký">
            <Input style={{ width: 240 }} maxLength={100} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}

/** Dossier, priority group and note of one student. */
export function StudentModal({ student, busy, onCancel, onSave }: { student: CompletionStudent | null; busy: boolean; onCancel: () => void; onSave: (body: unknown) => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (student) form.setFieldsValue({ dossierComplete: student.dossierComplete, priority: student.priority ?? '', note: student.note ?? '' });
  }, [student, form]);

  async function submit() {
    const v = await form.validateFields();
    onSave({ dossierComplete: v.dossierComplete, priority: v.priority?.trim() || null, note: v.note?.trim() || null });
  }

  return (
    <Modal title={student ? `Hồ sơ xét công nhận · ${student.fullName}` : ''} open={!!student} onCancel={onCancel} onOk={submit} okText="Lưu" cancelText="Hủy" confirmLoading={busy} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="dossierComplete" label="Hồ sơ đầy đủ" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="priority" label="Diện ưu tiên">
          <AutoComplete options={PRIORITIES.map((p) => ({ value: p }))} placeholder="Không" filterOption={(input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={2} maxLength={500} placeholder="Ví dụ: thiếu bản sao giấy khai sinh" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

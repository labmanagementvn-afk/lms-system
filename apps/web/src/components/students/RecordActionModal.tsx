'use client';

import { Alert, App, Checkbox, DatePicker, Form, Input, Modal, Radio, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { AWARD_FORM, DISCIPLINE_MEASURE, SEVERITY } from '@/lib/labels';
import { todayIn } from '@/lib/time';

export type RecordAction = 'move' | 'transfer' | 'drop' | 'readmit' | 'award' | 'discipline';
export interface PickedStudent {
  id: string;
  fullName: string;
  className?: string | null;
  gradeLevel?: number | null;
}

const TITLE: Record<RecordAction, string> = {
  move: 'Chuyển lớp',
  transfer: 'Chuyển trường',
  drop: 'Thôi học',
  readmit: 'Tiếp nhận trở lại',
  award: 'Khen thưởng',
  discipline: 'Ghi nhận vi phạm và biện pháp giáo dục',
};

/** Forms a teacher may give; the rest are decided by the school (Thông tư 19/2025, Điều 6 to 10). */
const TEACHER_AWARDS = ['CLASS_PRAISE', 'LETTER'];
const PRIMARY_MAX_GRADE = 5;

/** Studying students of one class, to pick several at once. */
function ClassStudents({ value, onChange }: { value?: PickedStudent[]; onChange?: (v: PickedStudent[]) => void }) {
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const klass = classes?.find((c) => c.id === classId);
  const { data } = useSWR<{ items: any[] }>(classId ? ['/students', { classId, status: 'STUDYING', pageSize: 100 }] : null);
  return (
    <Space.Compact block>
      <Select
        placeholder="Lớp"
        value={classId}
        onChange={(id) => {
          setClassId(id);
          onChange?.([]);
        }}
        style={{ width: 120 }}
        showSearch
        optionFilterProp="label"
        options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Select
        mode="multiple"
        placeholder="Chọn học sinh"
        disabled={!classId}
        value={(value ?? []).map((s) => s.id)}
        onChange={(ids: string[]) => onChange?.(ids.map((id) => ({ id, fullName: data?.items.find((s) => s.id === id)?.fullName ?? '', className: klass?.name, gradeLevel: klass?.gradeLevel })))}
        optionFilterProp="label"
        options={(data?.items ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
        style={{ flex: 1 }}
      />
    </Space.Compact>
  );
}

/**
 * The record actions on one or several students: chuyển lớp, chuyển trường, thôi học,
 * tiếp nhận trở lại, khen thưởng and kỷ luật. With no students given, the form asks
 * for a class and its students.
 */
export function RecordActionModal({ action, students, onClose, onDone }: { action: RecordAction | null; students: PickedStudent[]; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const { data: classes } = useClasses();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const pick = !students.length;
  const picked: PickedStudent[] = Form.useWatch('students', form) ?? [];
  const chosen = pick ? picked : students;
  const measure = Form.useWatch('measure', form);

  useEffect(() => {
    if (!action) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs(todayIn(tz)), notifyParents: true, severity: 1, measure: 'REMINDER', form: 'CLASS_PRAISE', students: [] });
  }, [action, form, tz]);

  // Chuyển lớp stays within the grade; tiếp nhận trở lại may be to any class.
  const grades = [...new Set(chosen.map((s) => s.gradeLevel).filter((g): g is number => !!g))];
  const classOptions = (classes ?? []).filter((c) => action !== 'move' || !grades.length || grades.includes(c.gradeLevel)).map((c) => ({ value: c.id, label: c.name }));
  // Primary pupils: a reminder or an apology; older students: a reminder, criticism or a self-review (Điều 13).
  const primary = grades.length > 0 && grades.every((g) => g <= PRIMARY_MAX_GRADE);
  const secondary = grades.length > 0 && grades.every((g) => g > PRIMARY_MAX_GRADE);
  const measures = Object.entries(DISCIPLINE_MEASURE)
    .filter(([value, m]) => (primary ? m.primary : secondary ? value !== 'APOLOGY' : true))
    .map(([value, m]) => ({ value, label: m.label }));
  const awards = Object.entries(AWARD_FORM)
    .filter(([f]) => me?.role !== 'TEACHER' || TEACHER_AWARDS.includes(f))
    .map(([value, label]) => ({ value, label }));

  async function save() {
    const v = await form.validateFields();
    const ids = chosen.map((s) => s.id);
    if (!ids.length) return void message.warning('Chọn ít nhất một học sinh');
    const date = v.date?.format('YYYY-MM-DD');
    const text = (x?: string) => x?.trim() || undefined;
    setSaving(true);
    try {
      let done = '';
      if (action === 'move') {
        const r = await api('/students/move-class', { method: 'POST', body: { studentIds: ids, toClassId: v.toClassId, date, reason: text(v.reason) } });
        done = `Đã chuyển ${r.moved + r.placed} học sinh sang lớp ${r.class.name}`;
      } else if (action === 'transfer') {
        await api('/students/transfer-out', { method: 'POST', body: { studentIds: ids, otherSchool: v.otherSchool.trim(), date, reason: text(v.reason), documentNo: text(v.documentNo) } });
        done = `Đã ghi nhận ${ids.length} học sinh chuyển trường`;
      } else if (action === 'drop') {
        await api('/students/drop-out', { method: 'POST', body: { studentIds: ids, reason: v.reason.trim(), date } });
        done = `Đã ghi nhận ${ids.length} học sinh thôi học`;
      } else if (action === 'readmit') {
        await api(`/students/${ids[0]}/readmit`, { method: 'POST', body: { classId: v.classId, date, reason: text(v.reason) } });
        done = 'Đã tiếp nhận học sinh trở lại học';
      } else if (action === 'award') {
        const r = await api('/students/awards', { method: 'POST', body: { studentIds: ids, form: v.form, content: v.content.trim(), date, issuer: text(v.issuer), decisionNo: text(v.decisionNo), notifyParents: v.notifyParents } });
        done = `Đã ghi nhận khen thưởng ${r.count} học sinh`;
      } else if (action === 'discipline') {
        const r = await api('/students/discipline', { method: 'POST', body: { studentIds: ids, measure: v.measure, severity: v.severity, violation: v.violation.trim(), support: text(v.support), date, notifyParents: v.notifyParents } });
        done = `Đã ghi nhận ${r.count} học sinh`;
      }
      message.success(done);
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!action) return null;
  const leaving = action === 'transfer' || action === 'drop';
  return (
    <Modal title={TITLE[action]} open onOk={save} confirmLoading={saving} onCancel={onClose} okText="Ghi nhận" cancelText="Hủy" width={600} destroyOnHidden okButtonProps={{ danger: leaving }}>
      <Form form={form} layout="vertical">
        {pick ? (
          <Form.Item name="students" label="Học sinh" rules={[{ validator: (_, v) => (v?.length ? Promise.resolve() : Promise.reject(new Error('Chọn học sinh'))) }]}>
            <ClassStudents />
          </Form.Item>
        ) : (
          <Form.Item label={`Học sinh (${students.length})`}>
            <div style={{ maxHeight: 96, overflow: 'auto' }}>
              {students.map((s) => (
                <Tag key={s.id} style={{ marginBottom: 4 }}>
                  {s.fullName}
                  {s.className ? ` · ${s.className}` : ''}
                </Tag>
              ))}
            </div>
          </Form.Item>
        )}

        {action === 'move' && (
          <>
            <Form.Item name="toClassId" label="Chuyển sang lớp" rules={[{ required: true, message: 'Chọn lớp' }]} extra="Điểm, kết quả và đơn xin nghỉ sắp tới của năm học chuyển theo học sinh sang lớp mới.">
              <Select options={classOptions} showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item name="reason" label="Lý do">
              <Input placeholder="Theo nguyện vọng của gia đình" maxLength={255} />
            </Form.Item>
          </>
        )}

        {action === 'transfer' && (
          <>
            <Form.Item name="otherSchool" label="Chuyển đến trường" rules={[{ required: true, message: 'Nhập trường chuyển đến' }]}>
              <Input placeholder="Trường THCS ..., phường/xã ..., tỉnh/thành phố ..." maxLength={255} />
            </Form.Item>
            <Space.Compact block>
              <Form.Item name="documentNo" label="Số giấy giới thiệu" style={{ width: '40%' }}>
                <Input placeholder="12/GGT-THCS" maxLength={50} />
              </Form.Item>
              <Form.Item name="reason" label="Lý do" style={{ width: '60%' }}>
                <Input placeholder="Gia đình chuyển nơi ở" maxLength={255} />
              </Form.Item>
            </Space.Compact>
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Tài khoản học sinh bị khóa và đơn xin nghỉ đang chờ được hủy. In giấy giới thiệu chuyển trường ở hồ sơ học sinh." />
          </>
        )}

        {action === 'drop' && (
          <>
            <Form.Item name="reason" label="Lý do thôi học" rules={[{ required: true, message: 'Nhập lý do' }]}>
              <Input placeholder="Hoàn cảnh gia đình khó khăn" maxLength={255} />
            </Form.Item>
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Tài khoản học sinh bị khóa; học sinh có thể được tiếp nhận trở lại sau." />
          </>
        )}

        {action === 'readmit' && (
          <>
            <Form.Item name="classId" label="Vào lớp" rules={[{ required: true, message: 'Chọn lớp' }]}>
              <Select options={classOptions} showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item name="reason" label="Ghi chú">
              <Input placeholder="Gia đình xin cho con đi học lại" maxLength={255} />
            </Form.Item>
          </>
        )}

        {action === 'award' && (
          <>
            <Form.Item name="form" label="Hình thức khen thưởng" rules={[{ required: true }]} extra={me?.role === 'TEACHER' ? 'Giáo viên tuyên dương trước lớp hoặc gửi thư khen; các hình thức khác do nhà trường quyết định.' : undefined}>
              <Select options={awards} />
            </Form.Item>
            <Form.Item name="content" label="Thành tích, việc tốt" rules={[{ required: true, message: 'Nhập nội dung khen thưởng' }]}>
              <Input.TextArea rows={2} maxLength={500} placeholder="Nhặt được của rơi trả người đánh mất" />
            </Form.Item>
            <Space.Compact block>
              <Form.Item name="issuer" label="Người, cấp khen" style={{ width: '55%' }}>
                <Input placeholder="Hiệu trưởng, GVCN, Liên đội ..." maxLength={100} />
              </Form.Item>
              <Form.Item name="decisionNo" label="Số quyết định" style={{ width: '45%' }}>
                <Input maxLength={50} />
              </Form.Item>
            </Space.Compact>
          </>
        )}

        {action === 'discipline' && (
          <>
            <Form.Item name="violation" label="Hành vi vi phạm" rules={[{ required: true, message: 'Mô tả hành vi vi phạm' }]}>
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <Form.Item name="severity" label="Mức độ vi phạm (Điều 12)">
              <Radio.Group>
                <Space direction="vertical">
                  {[1, 2, 3].map((n) => (
                    <Radio key={n} value={n}>
                      {SEVERITY[n]}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              name="measure"
              label="Biện pháp"
              extra={
                measure === 'SELF_REVIEW'
                  ? 'Gia đình được báo để xem, xác nhận và cùng nhà trường giúp học sinh; bản tự kiểm điểm được lưu vào hồ sơ.'
                  : 'Nhắc nhở cho vi phạm mức 1; phê bình khi đã nhắc nhở mà tái phạm hoặc vi phạm mức 2; viết bản tự kiểm điểm khi đã phê bình mà tái phạm mức 2 hoặc vi phạm mức 3 (Điều 15).'
              }
            >
              <Select options={measures} />
            </Form.Item>
            {me?.role !== 'ADMIN' && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Phê bình và yêu cầu viết bản tự kiểm điểm do Hiệu trưởng hoặc giáo viên chủ nhiệm thực hiện (Điều 17).
              </Typography.Paragraph>
            )}
            <Form.Item name="support" label="Hoạt động hỗ trợ học sinh (Điều 16)">
              <Input.TextArea rows={2} maxLength={500} placeholder="Gặp gỡ, tư vấn tâm lý, trao đổi với gia đình ..." />
            </Form.Item>
          </>
        )}

        <Space wrap align="start">
          <Form.Item name="date" label="Ngày" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" allowClear={false} />
          </Form.Item>
          {(action === 'award' || action === 'discipline') && (
            <Form.Item name="notifyParents" valuePropName="checked" label=" ">
              <Checkbox>Gửi thông báo cho phụ huynh</Checkbox>
            </Form.Item>
          )}
        </Space>
      </Form>
    </Modal>
  );
}

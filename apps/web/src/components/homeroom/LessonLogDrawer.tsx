'use client';

import { App, Button, Descriptions, Drawer, Form, Input, InputNumber, Radio, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSubjects } from '@/lib/hooks';
import { DAY } from '@/lib/labels';
import { formatTime } from '@/lib/time';

export interface LogbookCell {
  date: string;
  periodNumber: number;
  /** The timetable slot (with its entry, if written); null for a period outside the timetable. */
  slot: any | null;
}

/** The form for one period's logbook entry. */
export function LessonLogDrawer({
  open,
  cell,
  classId,
  students,
  onClose,
  onSaved,
}: {
  open: boolean;
  cell: LogbookCell | null;
  classId?: string;
  students: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const tz = useAuth().me!.school.timezone;
  const { data: subjects } = useSubjects();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const log = cell?.slot?.log ?? null;
  const status = Form.useWatch('status', form);

  useEffect(() => {
    if (!open || !cell) return;
    form.setFieldsValue({
      subjectId: log?.subject.id ?? cell.slot?.subject?.id,
      status: log?.status ?? 'DONE',
      // A new entry starts from the lesson in the teacher's lịch báo giảng.
      content: log?.content ?? (cell.slot?.plan ? `${cell.slot.plan.lessonNo ? `Tiết ${cell.slot.plan.lessonNo}: ` : ''}${cell.slot.plan.title}` : ''),
      comment: log?.comment ?? '',
      rating: log?.rating ?? undefined,
      absentStudentIds: log?.absentStudentIds ?? [],
    });
  }, [open, cell, log, form]);

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await api('/homeroom/logbook', {
        method: 'PUT',
        body: {
          classId,
          date: cell!.date,
          periodNumber: cell!.periodNumber,
          subjectId: v.subjectId,
          status: v.status,
          content: v.content ?? '',
          comment: v.status === 'DONE' && v.comment ? v.comment : undefined,
          rating: v.status === 'DONE' && v.rating ? v.rating : undefined,
          absentStudentIds: v.status === 'DONE' ? (v.absentStudentIds ?? []) : [],
        },
      });
      message.success('Đã lưu sổ đầu bài');
      onSaved();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const d = cell ? dayjs(cell.date) : null;
  const title = cell && d ? `${DAY[d.day() === 0 ? 7 : d.day()]} ${d.format('DD/MM/YYYY')} · Tiết ${cell.periodNumber}` : '';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      title={title}
      extra={
        <Button type="primary" onClick={save} loading={saving}>
          Lưu
        </Button>
      }
    >
      {cell?.slot ? (
        <Descriptions
          size="small"
          column={1}
          style={{ marginBottom: 12 }}
          items={[
            { key: 'slot', label: 'Theo thời khóa biểu', children: `${cell.slot.subject.name} · ${cell.slot.teacher.fullName}${cell.slot.room ? ` · ${cell.slot.room}` : ''}` },
            ...(log
              ? [{ key: 'by', label: 'Người ghi', children: `${log.teacher.fullName} · ${dayjs(log.updatedAt).format('DD/MM/YYYY')} ${formatTime(log.updatedAt, tz)}` }]
              : []),
          ]}
        />
      ) : (
        <Typography.Paragraph type="secondary">Tiết này không có trong thời khóa biểu; chọn môn học đã dạy.</Typography.Paragraph>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="subjectId" label="Môn học" rules={[{ required: true, message: 'Chọn môn học' }]}>
          <Select showSearch optionFilterProp="label" options={subjects?.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item name="status" label="Tiết học">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'DONE', label: 'Đã dạy' },
              { value: 'CANCELLED', label: 'Nghỉ tiết' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="content"
          label={status === 'CANCELLED' ? 'Lý do nghỉ tiết' : 'Nội dung bài dạy'}
          rules={[{ required: status !== 'CANCELLED', message: 'Nhập nội dung bài dạy' }, { max: 2000 }]}
        >
          <Input.TextArea rows={3} placeholder={status === 'CANCELLED' ? 'Giáo viên đi tập huấn' : 'Bài 3: Phân số'} />
        </Form.Item>
        {status !== 'CANCELLED' && (
          <>
            <Form.Item name="comment" label="Nhận xét tiết học" rules={[{ max: 2000 }]}>
              <Input.TextArea rows={2} placeholder="Lớp học sôi nổi, một số em chưa làm bài tập..." />
            </Form.Item>
            <Form.Item name="rating" label="Xếp loại tiết học (1-10)">
              <InputNumber min={1} max={10} precision={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="absentStudentIds" label="Học sinh vắng trong tiết">
              <Select mode="multiple" optionFilterProp="label" placeholder="Chọn học sinh vắng mặt" options={students.map((s) => ({ value: s.id, label: `${s.fullName} (${s.code})` }))} />
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  );
}

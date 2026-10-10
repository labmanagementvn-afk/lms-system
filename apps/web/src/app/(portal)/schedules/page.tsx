'use client';

import { App, Button, Card, Empty, Form, Input, Modal, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses, usePeriods, useSubjects } from '@/lib/hooks';
import { DAY, periods as periodsText, SESSION } from '@/lib/labels';
import { AssignmentList, orderSubjects } from '@/lib/teaching';

const DAYS = [1, 2, 3, 4, 5, 6];

export default function SchedulesPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const [mode, setMode] = useState<'class' | 'teacher'>(me?.role === 'TEACHER' ? 'teacher' : 'class');
  const [semester, setSemester] = useState(1);
  const { data: classes } = useClasses();
  const { data: teachers } = useAllTeachers();
  const { data: subjects } = useSubjects();
  const { data: periods } = usePeriods();
  const [classId, setClassId] = useState<string>();
  const [teacherId, setTeacherId] = useState<string | undefined>(me?.teacherId ?? undefined);
  const [cell, setCell] = useState<{ dayOfWeek: number; periodNumber: number; entry?: any } | null>(null);
  const [form] = Form.useForm();
  const editable = canManage(me) && mode === 'class';

  useEffect(() => {
    if (!classId && classes?.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const filter = mode === 'class' ? { classId } : { teacherId };
  const ready = mode === 'class' ? !!classId : !!teacherId;
  const { data: entries, mutate } = useSWR<any[]>(ready ? ['/timetable', { ...filter, semester }] : null);
  // Phân công giảng dạy of the class: who should teach each subject and for how many periods.
  const { data: plan, mutate: mutatePlan } = useSWR<AssignmentList>(mode === 'class' && classId ? ['/teaching/assignments', { semester, classId }] : null);
  const assignedTo = (subjectId?: string) => (plan?.items ?? []).filter((a) => a.subject.id === subjectId);

  const grid = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of entries ?? []) map.set(`${e.dayOfWeek}-${e.periodNumber}`, e);
    return map;
  }, [entries]);

  function openCell(dayOfWeek: number, periodNumber: number) {
    if (!editable) return;
    const entry = grid.get(`${dayOfWeek}-${periodNumber}`);
    setCell({ dayOfWeek, periodNumber, entry });
    form.resetFields();
    if (entry) form.setFieldsValue({ subjectId: entry.subject.id, teacherId: entry.teacher.id, room: entry.room });
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (cell?.entry) {
        await api(`/timetable/${cell.entry.id}`, { method: 'PATCH', body: { ...values, room: values.room || null } });
      } else {
        await api('/timetable', {
          method: 'POST',
          body: { ...values, room: values.room || undefined, classId, semester, dayOfWeek: cell!.dayOfWeek, periodNumber: cell!.periodNumber },
        });
      }
      setCell(null);
      mutate();
      mutatePlan();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove() {
    await api(`/timetable/${cell!.entry.id}`, { method: 'DELETE' });
    setCell(null);
    mutate();
    mutatePlan();
  }

  /** Each subject of the class: periods and teachers assigned against those on the timetable. */
  const check = useMemo(() => {
    if (!plan) return [];
    const subjectsOf = new Map<string, { id: string; code: string; name: string }>();
    for (const a of plan.items) subjectsOf.set(a.subject.id, a.subject);
    for (const e of entries ?? []) subjectsOf.set(e.subject.id, e.subject);
    return orderSubjects([...subjectsOf.values()]).map((subject) => {
      const assigned = plan.items.filter((a) => a.subject.id === subject.id);
      const scheduled = (entries ?? []).filter((e) => e.subject.id === subject.id);
      const want = assigned.reduce((x, a) => x + a.periodsPerWeek, 0);
      const strangers = [...new Set(scheduled.filter((e) => !assigned.some((a) => a.teacher.id === e.teacher.id)).map((e) => e.teacher.fullName as string))];
      const status = !assigned.length
        ? { color: 'default', label: 'Chưa phân công' }
        : strangers.length
          ? { color: 'red', label: `Khác giáo viên: ${strangers.join(', ')}` }
          : scheduled.length < want
            ? { color: 'orange', label: `Thiếu ${periodsText(want - scheduled.length)} tiết` }
            : scheduled.length > want
              ? { color: 'blue', label: `Thừa ${periodsText(scheduled.length - want)} tiết` }
              : { color: 'green', label: 'Khớp' };
      return { subject, assigned, scheduled: scheduled.length, want, status };
    });
  }, [plan, entries]);

  const subjectId = Form.useWatch('subjectId', form);
  const teacherOptions = (teachers?.items ?? [])
    .filter((t) => !subjectId || t.subjects.some((s: any) => s.subjectId === subjectId))
    .map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})` }));

  return (
    <>
      <PageHeader title="Thời khóa biểu" />
      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} optionType="button">
          <Radio.Button value="class">Theo lớp</Radio.Button>
          <Radio.Button value="teacher">Theo giáo viên</Radio.Button>
        </Radio.Group>
        {mode === 'class' ? (
          <Select value={classId} onChange={setClassId} style={{ width: 140 }} options={classes?.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
        ) : (
          <Select
            value={teacherId}
            onChange={setTeacherId}
            showSearch
            optionFilterProp="label"
            placeholder="Chọn giáo viên"
            style={{ width: 240 }}
            options={teachers?.items.map((t) => ({ value: t.id, label: t.fullName }))}
          />
        )}
        <Select value={semester} onChange={setSemester} style={{ width: 120 }} options={[{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]} />
      </Space>
      {editable && (
        <Typography.Paragraph type="secondary">Bấm vào một ô để thêm hoặc sửa tiết học. Hệ thống sẽ báo nếu trùng lịch giáo viên, lớp hoặc phòng.</Typography.Paragraph>
      )}
      {!periods?.length ? (
        <Empty description="Chưa khai báo tiết học. Vào Thiết lập để thêm khung giờ tiết học." />
      ) : (
        <Table<any>
          className="timetable"
          rowKey="number"
          bordered
          size="small"
          pagination={false}
          scroll={{ x: 900 }}
          dataSource={periods}
          columns={[
            {
              title: 'Tiết',
              width: 110,
              fixed: 'left',
              render: (_, p) => (
                <div>
                  <b>Tiết {p.number}</b>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {SESSION[p.session]} {p.startTime}-{p.endTime}
                  </div>
                </div>
              ),
            },
            ...DAYS.map((d) => ({
              title: DAY[d],
              key: d,
              render: (_: unknown, p: any) => {
                const e = grid.get(`${d}-${p.number}`);
                return (
                  <div className="tt-cell" onClick={() => openCell(d, p.number)} style={{ cursor: editable ? 'pointer' : 'default' }}>
                    {e && (
                      <>
                        <div style={{ fontWeight: 600 }}>{e.subject.name}</div>
                        <div style={{ fontSize: 12 }}>{mode === 'class' ? e.teacher.fullName : `Lớp ${e.class.name}`}</div>
                        {e.room && <div style={{ fontSize: 12, color: '#64748b' }}>{e.room}</div>}
                      </>
                    )}
                  </div>
                );
              },
            })),
          ]}
        />
      )}
      <Modal
        title={cell ? `${DAY[cell.dayOfWeek]} · Tiết ${cell.periodNumber}` : ''}
        open={!!cell}
        onCancel={() => setCell(null)}
        destroyOnHidden
        footer={[
          cell?.entry && (
            <Button key="del" danger onClick={remove}>
              Xóa tiết
            </Button>
          ),
          <Button key="cancel" onClick={() => setCell(null)}>
            Hủy
          </Button>,
          <Button key="ok" type="primary" onClick={save}>
            Lưu
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="subjectId" label="Môn học" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={subjects?.map((s) => ({ value: s.id, label: s.name }))}
              // The teacher assigned to the subject in this class comes first.
              onChange={(id) => {
                const a = assignedTo(id);
                if (a.length) form.setFieldsValue({ teacherId: a[0].teacher.id });
              }}
            />
          </Form.Item>
          <Form.Item
            name="teacherId"
            label="Giáo viên"
            rules={[{ required: true }]}
            extra={assignedTo(subjectId).length ? `Phân công: ${assignedTo(subjectId).map((a) => `${a.teacher.fullName} (${periodsText(a.periodsPerWeek)} tiết/tuần)`).join(', ')}` : undefined}
          >
            <Select showSearch optionFilterProp="label" options={teacherOptions} />
          </Form.Item>
          <Form.Item name="room" label="Phòng học" extra="Để trống để dùng phòng của lớp">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      {mode === 'class' && plan && (
        <Card size="small" title="Đối chiếu phân công giảng dạy" style={{ marginTop: 16 }}>
          {plan.items.length ? (
            <Table
              rowKey={(r) => r.subject.id}
              size="small"
              pagination={false}
              dataSource={check}
              columns={[
                { title: 'Môn học', render: (_, r) => r.subject.name },
                { title: 'Phân công', render: (_, r) => r.assigned.map((a) => `${a.teacher.fullName} (${periodsText(a.periodsPerWeek)})`).join(', ') },
                { title: 'Tiết/tuần theo phân công', align: 'center', render: (_, r) => (r.assigned.length ? periodsText(r.want) : '') },
                { title: 'Tiết trên thời khóa biểu', align: 'center', render: (_, r) => r.scheduled },
                { title: '', render: (_, r) => <Tag color={r.status.color}>{r.status.label}</Tag> },
              ]}
            />
          ) : (
            <Typography.Text type="secondary">Lớp chưa có phân công giảng dạy trong học kỳ này. Lập phân công ở mục Cán bộ, giáo viên › Phân công giảng dạy.</Typography.Text>
          )}
        </Card>
      )}
    </>
  );
}

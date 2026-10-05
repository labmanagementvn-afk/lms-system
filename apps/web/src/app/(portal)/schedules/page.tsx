'use client';

import { App, Button, Empty, Form, Input, Modal, Radio, Select, Space, Table, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses, usePeriods, useSubjects } from '@/lib/hooks';
import { DAY, SESSION } from '@/lib/labels';

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
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function remove() {
    await api(`/timetable/${cell!.entry.id}`, { method: 'DELETE' });
    setCell(null);
    mutate();
  }

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
            <Select showSearch optionFilterProp="label" options={subjects?.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="teacherId" label="Giáo viên" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={teacherOptions} />
          </Form.Item>
          <Form.Item name="room" label="Phòng học" extra="Để trống để dùng phòng của lớp">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

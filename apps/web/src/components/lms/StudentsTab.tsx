'use client';

import { DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { App, Button, Modal, Popconfirm, Progress, Select, Space, Table, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useClasses } from '@/lib/hooks';
import { PROGRESS_STATUS } from '@/lib/labels';
import { formatDateTime, formatDuration } from './format';

type Row = {
  student: { id: string; code: string; fullName: string; class: { id: string; name: string } | null };
  enrolledAt: string;
  progressPct: number;
  completedAt: string | null;
  lastAt: string | null;
  secondsSpent: number;
  lessons: Record<string, { status: string; secondsSpent: number }>;
};

/** Enrolled students with progress, plus a picker to add students by class. */
export function StudentsTab({ courseId, tz }: { courseId: string; tz: string }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<{ lessons: { id: string; title: string; type: string }[]; students: Row[] }>([`/lms/courses/${courseId}/students`]);
  const [adding, setAdding] = useState(false);

  async function remove(studentId: string) {
    try {
      await api(`/lms/courses/${courseId}/students/${studentId}`, { method: 'DELETE' });
      message.success('Đã bỏ học sinh khỏi khóa học');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const lessons = data?.lessons ?? [];
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAdding(true)}>
          Thêm học sinh
        </Button>
        <Typography.Text type="secondary">{data?.students.length ?? 0} học sinh</Typography.Text>
      </Space>
      <Table<Row>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={data?.students}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        columns={[
          { title: 'Mã HS', width: 110, render: (_, r) => r.student.code },
          { title: 'Họ và tên', render: (_, r) => r.student.fullName },
          { title: 'Lớp', width: 80, render: (_, r) => r.student.class?.name ?? '' },
          {
            title: 'Tiến độ',
            width: 220,
            sorter: (a, b) => a.progressPct - b.progressPct,
            render: (_, r) => {
              const done = Object.values(r.lessons).filter((l) => l.status === 'COMPLETED').length;
              return (
                <Tooltip
                  title={
                    <div>
                      {lessons.map((l) => (
                        <div key={l.id}>
                          {PROGRESS_STATUS[r.lessons[l.id]?.status ?? 'NOT_STARTED'].label}: {l.title}
                        </div>
                      ))}
                    </div>
                  }
                >
                  <Progress percent={r.progressPct} size="small" format={() => `${r.progressPct}% · ${done}/${lessons.length} bài`} />
                </Tooltip>
              );
            },
          },
          { title: 'Thời gian học', width: 130, render: (_, r) => formatDuration(r.secondsSpent) },
          { title: 'Hoạt động cuối', width: 150, render: (_, r) => (r.lastAt ? formatDateTime(r.lastAt, tz) : <span style={{ color: '#94a3b8' }}>Chưa học</span>) },
          { title: 'Hoàn thành', width: 150, render: (_, r) => formatDateTime(r.completedAt, tz) },
          {
            title: '',
            width: 50,
            render: (_, r) => (
              <Popconfirm title="Bỏ học sinh này khỏi khóa học?" okText="Bỏ" cancelText="Hủy" onConfirm={() => remove(r.student.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <AddStudentsModal open={adding} courseId={courseId} enrolledIds={new Set((data?.students ?? []).map((r) => r.student.id))} onClose={() => setAdding(false)} onAdded={() => mutate()} />
    </>
  );
}

function AddStudentsModal({ open, courseId, enrolledIds, onClose, onAdded }: { open: boolean; courseId: string; enrolledIds: Set<string>; onClose: () => void; onAdded: () => void }) {
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useSWR<{ items: any[] }>(open && classId ? ['/students', { classId, status: 'STUDYING', pageSize: 100 }] : null);
  const candidates = (data?.items ?? []).filter((s) => !enrolledIds.has(s.id));

  async function add() {
    if (!selected.length) return;
    setSaving(true);
    try {
      const r = await api(`/lms/courses/${courseId}/students`, { method: 'POST', body: { studentIds: selected } });
      message.success(`Đã thêm ${r.added} học sinh`);
      setSelected([]);
      onAdded();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Thêm học sinh vào khóa học" open={open} onCancel={onClose} onOk={add} okText={`Thêm ${selected.length || ''}`.trim()} cancelText="Hủy" okButtonProps={{ disabled: !selected.length }} confirmLoading={saving} width={640}>
      <Space style={{ marginBottom: 12 }}>
        <Select placeholder="Chọn lớp" style={{ width: 200 }} value={classId} onChange={(v) => (setClassId(v), setSelected([]))} options={(classes ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
        <Button disabled={!candidates.length} onClick={() => setSelected(candidates.map((s) => s.id))}>
          Chọn cả lớp
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={candidates}
        pagination={false}
        scroll={{ y: 320 }}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        locale={{ emptyText: classId ? 'Cả lớp đã tham gia khóa học' : 'Chọn lớp để xem danh sách' }}
        columns={[
          { title: 'Mã HS', dataIndex: 'code', width: 120 },
          { title: 'Họ và tên', dataIndex: 'fullName' },
        ]}
      />
    </Modal>
  );
}

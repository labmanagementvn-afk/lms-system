'use client';

import { CheckOutlined, EditOutlined, FolderOpenOutlined, RollbackOutlined } from '@ant-design/icons';
import { App, Button, Empty, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { CONDUCT_STATUS, RESULT_LEVEL } from '@/lib/labels';
import { AssessmentDrawer } from './AssessmentDrawer';
import { ConductLevelTag, ConductStatusTag } from './ConductLevelTag';
import { AssessmentBrief, Criterion } from './types';

interface Row {
  student: { id: string; code: string; fullName: string };
  assessment: AssessmentBrief | null;
}
interface ClassView {
  class: { id: string; name: string; gradeLevel: number; homeroomTeacherId: string | null };
  criteria: Criterion[];
  rows: Row[];
  summary: { total: number; opened: number; status: Record<string, number>; level: Record<string, number> };
}

const STATUS_ORDER = ['DRAFT', 'SELF_ASSESSED', 'REVIEWED', 'APPROVED'];
const LEVEL_ORDER = ['TOT', 'KHA', 'DAT', 'CHUA_DAT'];

/** Students of a class with their assessment for the round: open, review in a drawer, approve / reopen (office). */
export function ClassAssessments({ classId, semester, month, staff }: { classId?: string; semester: number; month: number; staff: boolean }) {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<ClassView>(classId ? ['/conduct/class', { classId, semester, month }] : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setSelected([]), [classId, semester, month]);

  const num = (v: number | null | undefined) => (v == null ? <span style={{ color: '#9ca3af' }}>—</span> : v);
  const round = { classId, semester, month };

  async function run(key: string, path: string, body: Record<string, unknown>, done: (res: any) => string) {
    setBusy(key);
    try {
      const res = await api(path, { method: 'POST', body });
      message.success(done(res));
      setSelected([]);
      await mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const open = () => run('open', '/conduct/class/open', round, (r) => (r.created ? `Đã mở đợt đánh giá cho ${r.created} học sinh` : 'Mọi học sinh đã có phiếu đánh giá'));
  const approve = (studentIds?: string[]) => run('approve', '/conduct/class/approve', { ...round, studentIds }, (r) => `Đã duyệt ${r.approved} phiếu đánh giá`);
  const reopen = (studentIds?: string[]) => run('reopen', '/conduct/class/reopen', { ...round, studentIds }, (r) => `Đã mở lại ${r.reopened} phiếu đánh giá`);

  if (!classId) return <Empty description="Chọn lớp để đánh giá" />;

  const s = data?.summary;
  const reviewedCount = s?.status.REVIEWED ?? 0;
  const approvedCount = s?.status.APPROVED ?? 0;
  const selectedRows = (data?.rows ?? []).filter((r) => selected.includes(r.student.id));
  const selectedReviewed = selectedRows.filter((r) => r.assessment?.status === 'REVIEWED').length;
  const selectedApproved = selectedRows.filter((r) => r.assessment?.status === 'APPROVED').length;

  const columns: ColumnsType<Row> = [
    { title: '#', width: 50, render: (_, __, i) => i + 1 },
    { title: 'Mã', width: 110, render: (_, r) => r.student.code },
    { title: 'Họ và tên', width: 220, render: (_, r) => <b>{r.student.fullName}</b> },
    { title: 'Trạng thái', width: 170, render: (_, r) => <ConductStatusTag status={r.assessment?.status} /> },
    { title: 'HS tự chấm', width: 100, align: 'center', render: (_, r) => num(r.assessment?.selfTotal) },
    { title: 'GVCN chấm', width: 100, align: 'center', render: (_, r) => num(r.assessment?.teacherTotal) },
    { title: 'Kết quả', width: 90, align: 'center', render: (_, r) => <b>{num(r.assessment?.finalTotal)}</b> },
    { title: 'Xếp loại', width: 110, render: (_, r) => <ConductLevelTag level={r.assessment?.level} /> },
    {
      title: '',
      width: 110,
      render: (_, r) =>
        r.assessment && (
          <Button size="small" icon={<EditOutlined />} onClick={() => setDrawerId(r.assessment!.id)}>
            {r.assessment.status === 'APPROVED' ? 'Xem' : 'Đánh giá'}
          </Button>
        ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 8 }}>
        {STATUS_ORDER.map((k) => (
          <Tag key={k} color={CONDUCT_STATUS[k].color}>
            {CONDUCT_STATUS[k].label} {s?.status[k] ?? 0}
          </Tag>
        ))}
        <Tag>Chưa mở {s ? s.total - s.opened : 0}</Tag>
        <Typography.Text type="secondary">·</Typography.Text>
        {LEVEL_ORDER.map((k) => (
          <Tag key={k} color={RESULT_LEVEL[k].color}>
            {RESULT_LEVEL[k].label} {s?.level[k] ?? 0}
          </Tag>
        ))}
        {s && <Typography.Text type="secondary">Sĩ số {s.total}</Typography.Text>}
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Button icon={<FolderOpenOutlined />} onClick={open} loading={busy === 'open'} disabled={!data || s!.opened >= s!.total}>
          Mở đợt đánh giá
        </Button>
        {staff && (
          <>
            <Popconfirm title={`Duyệt ${selectedReviewed} phiếu đã chọn?`} okText="Duyệt" cancelText="Hủy" onConfirm={() => approve(selected)} disabled={!selectedReviewed}>
              <Button type="primary" icon={<CheckOutlined />} loading={busy === 'approve'} disabled={!selectedReviewed}>
                Duyệt đã chọn{selectedReviewed ? ` (${selectedReviewed})` : ''}
              </Button>
            </Popconfirm>
            <Popconfirm title={`Duyệt toàn bộ ${reviewedCount} phiếu GVCN đã đánh giá?`} okText="Duyệt tất cả" cancelText="Hủy" onConfirm={() => approve()} disabled={!reviewedCount}>
              <Button icon={<CheckOutlined />} loading={busy === 'approve'} disabled={!reviewedCount}>
                Duyệt tất cả
              </Button>
            </Popconfirm>
            <Popconfirm
              title={selectedApproved ? `Mở lại ${selectedApproved} phiếu đã chọn? Kết quả rèn luyện trong sổ điểm sẽ bị xóa.` : `Mở lại toàn bộ ${approvedCount} phiếu đã duyệt? Kết quả rèn luyện trong sổ điểm sẽ bị xóa.`}
              okText="Mở lại"
              okButtonProps={{ danger: true }}
              cancelText="Hủy"
              onConfirm={() => reopen(selectedApproved ? selected : undefined)}
              disabled={!(selectedApproved || approvedCount)}
            >
              <Button danger icon={<RollbackOutlined />} loading={busy === 'reopen'} disabled={!(selectedApproved || approvedCount)}>
                Mở lại{selectedApproved ? ` (${selectedApproved})` : ''}
              </Button>
            </Popconfirm>
          </>
        )}
      </Space>
      <Table<Row>
        rowKey={(r) => r.student.id}
        loading={isLoading}
        dataSource={data?.rows ?? []}
        size="small"
        pagination={false}
        scroll={{ x: 1000 }}
        columns={columns}
        rowSelection={
          staff
            ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), getCheckboxProps: (r) => ({ disabled: !r.assessment }) }
            : undefined
        }
      />
      <AssessmentDrawer assessmentId={drawerId} onClose={() => setDrawerId(null)} onSaved={() => mutate()} />
    </>
  );
}

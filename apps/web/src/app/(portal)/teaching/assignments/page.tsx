'use client';

import { CopyOutlined, DeleteOutlined, FilePdfOutlined, ImportOutlined, MinusCircleOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadFile } from '@/components/grades/download';
import { api } from '@/lib/api';
import { canManage, useAuth } from '@/lib/auth';
import { useAllTeachers, useClasses, useSubjects } from '@/lib/hooks';
import { periods } from '@/lib/labels';
import { Assignment, AssignmentList, byClassName, orderSubjects, periodInput } from '@/lib/teaching';

const cellKey = (classId: string, subjectId: string) => `${classId}|${subjectId}`;
const sum = (xs: number[]) => Math.round(xs.reduce((a, x) => a + x, 0) * 10) / 10;

/**
 * Phân công giảng dạy: who teaches each subject in each class in a semester, and how
 * many periods a week. Once a semester has any assignment, only the assigned teacher
 * enters the marks of that subject in that class.
 */
export default function AssignmentsPage() {
  const { me } = useAuth();
  const admin = canManage(me);
  const { message } = App.useApp();
  const [semester, setSemester] = useState(1);
  const [grade, setGrade] = useState<number>();
  const [view, setView] = useState<'class' | 'teacher'>('class');
  const { data, isLoading, mutate } = useSWR<AssignmentList>(['/teaching/assignments', { semester }]);
  const { data: classes } = useClasses();
  const { data: subjectList } = useSubjects();
  const { data: teacherList } = useAllTeachers();
  const [cell, setCell] = useState<{ klass: any; subject: any } | null>(null);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState<string | null>(null);

  const teachers = useMemo(() => teacherList?.items ?? [], [teacherList]);
  const teacherName = useMemo(() => new Map(teachers.map((t) => [t.id, t.fullName as string])), [teachers]);
  const subjects = useMemo(() => orderSubjects(subjectList ?? []), [subjectList]);
  const rows = useMemo(() => [...(classes ?? [])].filter((c) => !grade || c.gradeLevel === grade).sort(byClassName), [classes, grade]);
  const grades = useMemo(() => [...new Set((classes ?? []).map((c) => c.gradeLevel as number))].sort((a, b) => a - b), [classes]);

  const assigned = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of data?.items ?? []) m.set(cellKey(a.class.id, a.subject.id), [...(m.get(cellKey(a.class.id, a.subject.id)) ?? []), a]);
    return m;
  }, [data]);
  const timetable = useMemo(() => {
    const m = new Map<string, AssignmentList['timetable']>();
    for (const t of data?.timetable ?? []) m.set(cellKey(t.classId, t.subjectId), [...(m.get(cellKey(t.classId, t.subjectId)) ?? []), t]);
    return m;
  }, [data]);

  /** Why a cell's assignment differs from the timetable, or null. */
  const mismatch = (classId: string, subjectId: string) => {
    const list = assigned.get(cellKey(classId, subjectId)) ?? [];
    const tt = timetable.get(cellKey(classId, subjectId)) ?? [];
    if (!list.length || !tt.length) return null;
    const others = tt.filter((t) => !list.some((a) => a.teacher.id === t.teacherId));
    if (others.length) return `Thời khóa biểu xếp ${others.map((t) => teacherName.get(t.teacherId) ?? 'giáo viên khác').join(', ')} dạy môn này`;
    const a = sum(list.map((x) => x.periodsPerWeek));
    const b = sum(tt.map((t) => t.periods));
    return a !== b ? `Phân công ${periods(a)} tiết/tuần, thời khóa biểu có ${periods(b)} tiết` : null;
  };

  const stats = useMemo(() => {
    const keys = new Set([...assigned.keys()]);
    const ttOnly = [...timetable.keys()].filter((k) => !keys.has(k)).length;
    return { cells: keys.size, ttOnly };
  }, [assigned, timetable]);

  function open(klass: any, subject: any) {
    if (!admin) return;
    const list = assigned.get(cellKey(klass.id, subject.id)) ?? [];
    const tt = timetable.get(cellKey(klass.id, subject.id)) ?? [];
    form.setFieldsValue({
      teachers: list.length
        ? list.map((a) => ({ teacherId: a.teacher.id, periodsPerWeek: a.periodsPerWeek }))
        : tt.length
          ? tt.map((t) => ({ teacherId: t.teacherId, periodsPerWeek: t.periods }))
          : [{ teacherId: undefined, periodsPerWeek: data?.suggested[subject.id] }],
    });
    setCell({ klass, subject });
  }

  async function save(clear = false) {
    if (!cell) return;
    const values = clear ? { teachers: [] } : await form.validateFields();
    try {
      await api('/teaching/assignments', {
        method: 'PUT',
        body: { classId: cell.klass.id, subjectId: cell.subject.id, semester, teachers: (values.teachers ?? []).filter((t: any) => t?.teacherId) },
      });
      message.success(clear ? 'Đã bỏ phân công' : 'Đã lưu phân công');
      setCell(null);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function action(name: 'timetable' | 'copy') {
    setBusy(name);
    try {
      const r = await api<{ created: number }>(name === 'timetable' ? '/teaching/assignments/from-timetable' : '/teaching/assignments/copy', {
        method: 'POST',
        body: name === 'timetable' ? { semester } : { from: 1, to: 2 },
      });
      message.success(r.created ? `Đã tạo ${r.created} phân công` : 'Không có môn nào cần tạo thêm');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    setBusy('print');
    try {
      await downloadFile('/reports/teaching-by-class', { semester, gradeLevel: grade, format: 'pdf' }, `phan-cong-giang-day-hk${semester}.pdf`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Theo giáo viên: every active teacher with what they teach this semester.
  const byTeacher = useMemo(() => {
    const items = data?.items ?? [];
    return teachers
      .map((t) => {
        const mine = items.filter((a) => a.teacher.id === t.id);
        const subjectsOf = new Map<string, { name: string; classes: string[]; periods: number }>();
        for (const a of mine) {
          const s = subjectsOf.get(a.subject.id) ?? { name: a.subject.name, classes: [], periods: 0 };
          s.classes.push(a.class.name);
          s.periods = sum([s.periods, a.periodsPerWeek]);
          subjectsOf.set(a.subject.id, s);
        }
        return { teacher: t, teaching: [...subjectsOf.values()], total: sum(mine.map((a) => a.periodsPerWeek)) };
      })
      .sort((a, b) => (a.teacher.subjectGroup ?? '￿').localeCompare(b.teacher.subjectGroup ?? '￿', 'vi') || a.teacher.code.localeCompare(b.teacher.code, 'vi', { numeric: true }));
  }, [data, teachers]);

  const subjectId = cell?.subject.id;
  const teacherOptions = useMemo(
    () =>
      [...teachers]
        .sort((a, b) => Number(!a.subjects?.some((s: any) => s.subjectId === subjectId)) - Number(!b.subjects?.some((s: any) => s.subjectId === subjectId)) || a.fullName.localeCompare(b.fullName, 'vi'))
        .map((t) => ({ value: t.id, label: `${t.fullName} (${t.code})${t.subjects?.some((s: any) => s.subjectId === subjectId) ? '' : ' · không dạy môn này'}` })),
    [teachers, subjectId],
  );
  const cellTimetable = cell ? (timetable.get(cellKey(cell.klass.id, cell.subject.id)) ?? []) : [];

  return (
    <>
      <PageHeader
        title="Phân công giảng dạy"
        extra={
          <Space wrap>
            {admin && (
              <>
                <Popconfirm title="Lấy phân công từ thời khóa biểu?" description="Tạo phân công cho các môn của từng lớp chưa được phân công, theo giáo viên và số tiết trên thời khóa biểu." onConfirm={() => action('timetable')} okText="Tạo" cancelText="Hủy">
                  <Button icon={<ImportOutlined />} loading={busy === 'timetable'}>
                    Lấy từ thời khóa biểu
                  </Button>
                </Popconfirm>
                {semester === 2 && (
                  <Popconfirm title="Sao chép phân công học kỳ I?" description="Các môn chưa được phân công ở học kỳ II sẽ lấy theo học kỳ I." onConfirm={() => action('copy')} okText="Sao chép" cancelText="Hủy">
                    <Button icon={<CopyOutlined />} loading={busy === 'copy'}>
                      Sao chép từ học kỳ I
                    </Button>
                  </Popconfirm>
                )}
              </>
            )}
            <Button icon={<FilePdfOutlined />} onClick={print} loading={busy === 'print'}>
              In bảng phân công
            </Button>
          </Space>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={semester}
          onChange={(v) => setSemester(v as number)}
          options={[
            { value: 1, label: 'Học kỳ I' },
            { value: 2, label: 'Học kỳ II' },
          ]}
        />
        <Select allowClear placeholder="Tất cả các khối" style={{ width: 150 }} value={grade} onChange={setGrade} options={grades.map((g) => ({ value: g, label: `Khối ${g}` }))} />
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'class' | 'teacher')}
          options={[
            { value: 'class', label: 'Theo lớp' },
            { value: 'teacher', label: 'Theo giáo viên' },
          ]}
        />
        {data && (
          <Typography.Text type="secondary">
            Năm học {data.academicYear.name}: {stats.cells} môn-lớp đã phân công{stats.ttOnly ? `, ${stats.ttOnly} môn-lớp có trên thời khóa biểu chưa phân công` : ''}
          </Typography.Text>
        )}
      </Space>
      {data && (
        <Alert
          style={{ marginBottom: 12 }}
          type={data.items.length ? 'success' : 'info'}
          showIcon
          message={
            data.items.length
              ? 'Học kỳ đã có phân công: chỉ giáo viên được phân công mới nhập điểm môn đó ở lớp đó; giám sát nhập điểm và danh sách thiếu điểm theo phân công này.'
              : 'Học kỳ chưa có phân công: sổ điểm và giám sát nhập điểm đang dựa vào thời khóa biểu. Bấm "Lấy từ thời khóa biểu" để tạo nhanh rồi chỉnh từng ô.'
          }
        />
      )}
      {view === 'class' ? (
        <Table<any>
          rowKey="id"
          size="small"
          bordered
          loading={isLoading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 140 + subjects.length * 150 }}
          columns={[
            { title: 'Lớp', dataIndex: 'name', width: 80, fixed: 'left', render: (n, c) => <Tooltip title={c.homeroomTeacher ? `GVCN ${c.homeroomTeacher.fullName}` : 'Chưa có GVCN'}>{n}</Tooltip> },
            ...subjects.map((s) => ({
              title: s.name,
              key: s.id,
              width: 150,
              render: (_: unknown, c: any) => {
                const list = assigned.get(cellKey(c.id, s.id)) ?? [];
                const tt = timetable.get(cellKey(c.id, s.id)) ?? [];
                const why = mismatch(c.id, s.id);
                return (
                  <div onClick={() => open(c, s)} style={{ cursor: admin ? 'pointer' : undefined, minHeight: 22 }} role={admin ? 'button' : undefined} aria-label={admin ? `Phân công ${s.name} lớp ${c.name}` : undefined}>
                    {list.length ? (
                      list.map((a) => (
                        <div key={a.id}>
                          {a.teacher.fullName} <Typography.Text type="secondary">({periods(a.periodsPerWeek)})</Typography.Text>
                        </div>
                      ))
                    ) : tt.length ? (
                      <Typography.Text type="secondary" italic>
                        TKB: {tt.map((t) => `${teacherName.get(t.teacherId) ?? '?'} (${t.periods})`).join(', ')}
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    )}
                    {why && (
                      <Tooltip title={why}>
                        <WarningOutlined style={{ color: '#d97706', marginLeft: 4 }} />
                      </Tooltip>
                    )}
                  </div>
                );
              },
            })),
            {
              title: 'Tổng tiết/tuần',
              key: 'total',
              width: 90,
              align: 'center' as const,
              render: (_: unknown, c: any) => periods(sum((data?.items ?? []).filter((a) => a.class.id === c.id).map((a) => a.periodsPerWeek))),
            },
          ]}
        />
      ) : (
        <Table<any>
          rowKey={(r) => r.teacher.id}
          size="small"
          loading={isLoading}
          dataSource={byTeacher}
          pagination={false}
          columns={[
            { title: 'Mã GV', width: 90, render: (_, r) => r.teacher.code },
            { title: 'Họ và tên', width: 200, render: (_, r) => r.teacher.fullName },
            { title: 'Tổ chuyên môn', width: 230, render: (_, r) => r.teacher.subjectGroup ?? '' },
            {
              title: 'Phân công giảng dạy',
              render: (_, r) =>
                r.teaching.length ? (
                  r.teaching.map((t: any) => (
                    <div key={t.name}>
                      <b>{t.name}</b>: {t.classes.join(', ')} <Typography.Text type="secondary">({periods(t.periods)} tiết)</Typography.Text>
                    </div>
                  ))
                ) : (
                  <Tag>Chưa phân công</Tag>
                ),
            },
            { title: 'Số tiết/tuần', width: 100, align: 'center' as const, render: (_, r) => periods(r.total) },
          ]}
        />
      )}
      <Modal
        title={cell ? `${cell.subject.name} · Lớp ${cell.klass.name} · Học kỳ ${semester === 1 ? 'I' : 'II'}` : ''}
        open={!!cell}
        onCancel={() => setCell(null)}
        destroyOnHidden
        width={560}
        footer={[
          <Popconfirm key="clear" title="Bỏ phân công môn này?" onConfirm={() => save(true)} okText="Bỏ" cancelText="Hủy">
            <Button danger icon={<DeleteOutlined />} style={{ float: 'left' }}>
              Bỏ phân công
            </Button>
          </Popconfirm>,
          <Button key="cancel" onClick={() => setCell(null)}>
            Hủy
          </Button>,
          <Button key="ok" type="primary" onClick={() => save()}>
            Lưu
          </Button>,
        ]}
      >
        {cell && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {cellTimetable.length ? `Thời khóa biểu: ${cellTimetable.map((t) => `${teacherName.get(t.teacherId) ?? '?'} ${t.periods} tiết/tuần`).join(', ')}. ` : 'Môn này chưa có trên thời khóa biểu của lớp. '}
            {data?.suggested[cell.subject.id] ? `Theo số tiết cả năm của môn: khoảng ${periods(data.suggested[cell.subject.id])} tiết/tuần.` : ''}
          </Typography.Paragraph>
        )}
        <Form form={form} layout="vertical">
          <Form.List name="teachers">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f, i) => (
                  <Space key={f.key} align="start" style={{ display: 'flex' }}>
                    <Form.Item {...f} name={[f.name, 'teacherId']} label={i === 0 ? 'Giáo viên' : undefined} rules={[{ required: true, message: 'Chọn giáo viên' }]} style={{ width: 340 }}>
                      <Select showSearch optionFilterProp="label" options={teacherOptions} placeholder="Chọn giáo viên" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'periodsPerWeek']} label={i === 0 ? 'Tiết/tuần' : undefined} rules={[{ required: true, message: 'Nhập số tiết' }]}>
                      <InputNumber {...periodInput} min={0.5} max={40} style={{ width: 100 }} />
                    </Form.Item>
                    {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(f.name)} style={{ marginTop: i === 0 ? 38 : 8 }} aria-label="Bỏ giáo viên" />}
                  </Space>
                ))}
                {fields.length < 4 && (
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ periodsPerWeek: 1 })}>
                    Thêm giáo viên dạy cùng môn
                  </Button>
                )}
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

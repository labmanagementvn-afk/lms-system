'use client';

import {
  BookOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FilePdfOutlined,
  LoginOutlined,
  StopOutlined,
  SwapOutlined,
  TrophyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Empty, Input, Popconfirm, Row, Space, Spin, Statistic, Table, Tabs, Tag, Timeline, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { PromotionTag, ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { downloadFile } from '@/components/grades/download';
import { RecordAction, RecordActionModal } from '@/components/students/RecordActionModal';
import { StudentFormModal } from '@/components/students/StudentFormModal';
import { api } from '@/lib/api';
import { canEditStudents, useAuth } from '@/lib/auth';
import { ABSENCE_STATUS, AWARD_FORM, DISCIPLINE_MEASURE, dmy, GENDER, leaveDays, MOVEMENT_KIND, POLICY_GROUP, RELATIONSHIP, STUDENT_STATUS } from '@/lib/labels';

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ');

/** Một học sinh: lý lịch, gia đình, quá trình học tập, biến động, khen thưởng, kỷ luật và chuyên cần. */
export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR<any>([`/students/${id}/profile`]);
  const [editing, setEditing] = useState<any | null>(null);
  const [action, setAction] = useState<RecordAction | null>(null);
  const [support, setSupport] = useState<Record<string, string>>({});
  const office = canEditStudents(me);

  if (isLoading || !data) return <Spin style={{ display: 'block', margin: '64px auto' }} />;
  const s = data.student;
  const studying = s.status === 'STUDYING';
  const left = s.status === 'TRANSFERRED' || s.status === 'DROPPED';
  const homeroom = !!me?.teacherId && data.class?.homeroomTeacher?.id === me.teacherId;
  const mayDecide = me?.role === 'ADMIN' || homeroom;
  const picked = [{ id: s.id, fullName: s.fullName, className: data.class?.name, gradeLevel: data.class?.gradeLevel }];

  async function call(run: () => Promise<unknown>, ok: string) {
    try {
      await run();
      message.success(ok);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  const letter = () => call(() => downloadFile('/reports/transfer-letter', { studentId: s.id, format: 'pdf' }, `giay-gioi-thieu-chuyen-truong-${s.code}.pdf`), 'Đã tải giấy giới thiệu chuyển trường');

  return (
    <>
      <PageHeader
        title={s.fullName}
        extra={
          <Space wrap>
            <Link href={`/grades/transcript/${s.id}`}>
              <Button icon={<BookOutlined />}>Học bạ</Button>
            </Link>
            {office && (
              <Button icon={<EditOutlined />} onClick={() => setEditing({ ...s, enrollments: data.class ? [{ class: data.class }] : [] })}>
                Sửa hồ sơ
              </Button>
            )}
            {office && studying && (
              <>
                <Button icon={<SwapOutlined />} onClick={() => setAction('move')}>
                  Chuyển lớp
                </Button>
                <Button icon={<ExportOutlined />} onClick={() => setAction('transfer')}>
                  Chuyển trường
                </Button>
                <Button icon={<StopOutlined />} onClick={() => setAction('drop')}>
                  Thôi học
                </Button>
              </>
            )}
            {office && left && (
              <Button icon={<LoginOutlined />} onClick={() => setAction('readmit')}>
                Tiếp nhận trở lại
              </Button>
            )}
            {office && s.status === 'TRANSFERRED' && (
              <Button type="primary" icon={<FilePdfOutlined />} onClick={letter}>
                In giấy giới thiệu chuyển trường
              </Button>
            )}
            {studying && (
              <>
                <Button icon={<TrophyOutlined />} onClick={() => setAction('award')}>
                  Khen thưởng
                </Button>
                <Button icon={<WarningOutlined />} onClick={() => setAction('discipline')}>
                  Kỷ luật
                </Button>
              </>
            )}
          </Space>
        }
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Mã học sinh">{s.code}</Descriptions.Item>
          <Descriptions.Item label="Lớp">{data.class ? `${data.class.name} · năm học ${data.class.academicYear.name}` : 'Chưa xếp lớp'}</Descriptions.Item>
          <Descriptions.Item label="Tình trạng">
            <Tag color={studying ? 'green' : s.status === 'GRADUATED' ? 'blue' : 'orange'}>{STUDENT_STATUS[s.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Ngày sinh">{dmy(s.dateOfBirth)}</Descriptions.Item>
          <Descriptions.Item label="Giới tính">{GENDER[s.gender] ?? ''}</Descriptions.Item>
          <Descriptions.Item label="GVCN">{data.class?.homeroomTeacher?.fullName ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Mã định danh">{s.idNumber ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Mã CSDL ngành">{s.moetCode ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Dân tộc, tôn giáo">{join(s.ethnicity, s.religion)}</Descriptions.Item>
          <Descriptions.Item label="Nơi sinh">{s.birthPlace ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Quê quán">{s.hometown ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Quốc tịch">{s.nationality ?? ''}</Descriptions.Item>
          <Descriptions.Item label="Chỗ ở hiện nay" span={{ xs: 1, sm: 2, lg: 3 }}>
            {join(s.address, s.currentWard, s.currentProvince)}
          </Descriptions.Item>
          <Descriptions.Item label="Nơi thường trú" span={{ xs: 1, sm: 2, lg: 3 }}>
            {join(s.permanentAddress, s.permanentWard, s.permanentProvince)}
          </Descriptions.Item>
          <Descriptions.Item label="Diện chính sách">
            {s.policyGroups.length ? s.policyGroups.map((p: string) => <Tag key={p} color="purple">{POLICY_GROUP[p]}</Tag>) : 'Không'}
          </Descriptions.Item>
          <Descriptions.Item label="Đoàn, Đội">{[s.youngPioneer && 'Đội viên', s.youthUnion && 'Đoàn viên'].filter(Boolean).join(', ') || 'Không'}</Descriptions.Item>
          <Descriptions.Item label="Tài khoản học sinh">{s.account ? <Tag color={s.account.isActive ? 'green' : 'default'}>{s.account.username}{s.account.isActive ? '' : ' · đã khóa'}</Tag> : 'Chưa cấp'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs
        items={[
          {
            key: 'family',
            label: 'Gia đình',
            children: (
              <Table<any>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={s.guardians}
                scroll={{ x: 800 }}
                columns={[
                  { title: 'Họ và tên', dataIndex: 'fullName', render: (n, g) => (g.isPrimary ? <b>{n}</b> : n) },
                  { title: 'Quan hệ', dataIndex: 'relationship', width: 120, render: (r) => RELATIONSHIP[r] },
                  { title: 'Năm sinh', dataIndex: 'birthYear', width: 90 },
                  { title: 'Nghề nghiệp', dataIndex: 'occupation' },
                  { title: 'Điện thoại', dataIndex: 'phone', width: 130 },
                  { title: 'Số CCCD', dataIndex: 'idNumber', width: 140 },
                  { title: 'Ứng dụng phụ huynh', dataIndex: 'userId', width: 160, render: (u) => (u ? <Tag color="green">Đã liên kết</Tag> : <Tag>Chưa có tài khoản</Tag>) },
                ]}
              />
            ),
          },
          {
            key: 'years',
            label: 'Quá trình học tập',
            children: (
              <Table<any>
                rowKey={(y) => y.academicYear.id}
                size="small"
                pagination={false}
                dataSource={data.years}
                columns={[
                  { title: 'Năm học', render: (_, y) => <>{y.academicYear.name} {y.academicYear.isCurrent && <Tag color="blue">Hiện tại</Tag>}</> },
                  { title: 'Lớp', width: 80, render: (_, y) => y.class.name },
                  { title: 'GVCN', render: (_, y) => y.class.homeroomTeacher?.fullName ?? '' },
                  { title: 'Học tập', width: 100, render: (_, y) => <ResultLevelTag level={y.result?.academic} /> },
                  { title: 'Rèn luyện', width: 100, render: (_, y) => <ResultLevelTag level={y.result?.conduct} /> },
                  { title: 'Danh hiệu', render: (_, y) => y.result?.title ?? '' },
                  { title: 'Lên lớp', width: 130, render: (_, y) => <PromotionTag status={y.result?.promotion} /> },
                  { title: 'Ngày nghỉ', width: 90, render: (_, y) => y.result?.absentDays ?? '' },
                ]}
              />
            ),
          },
          {
            key: 'movements',
            label: `Biến động (${data.movements.length})`,
            children: data.movements.length ? (
              <Timeline
                style={{ marginTop: 12 }}
                items={data.movements.map((m: any) => ({
                  color: MOVEMENT_KIND[m.kind].color,
                  children: (
                    <>
                      <Typography.Text strong>
                        {dmy(m.date)} · {MOVEMENT_KIND[m.kind].label}
                      </Typography.Text>
                      {(m.fromClass || m.toClass) && (
                        <Typography.Text>
                          {' '}
                          {m.fromClass ? `lớp ${m.fromClass.name}` : ''}
                          {m.fromClass && m.toClass ? ' → ' : ''}
                          {m.toClass ? `lớp ${m.toClass.name}` : ''}
                        </Typography.Text>
                      )}
                      <div style={{ color: '#64748b' }}>{join(m.otherSchool, m.reason, m.documentNo && `số ${m.documentNo}`, m.academicYear && `năm học ${m.academicYear}`)}</div>
                    </>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có biến động" />
            ),
          },
          {
            key: 'awards',
            label: `Khen thưởng (${data.awards.length})`,
            children: (
              <Table<any>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data.awards}
                columns={[
                  { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
                  { title: 'Hình thức', dataIndex: 'form', width: 220, render: (f) => <Tag color="gold">{AWARD_FORM[f]}</Tag> },
                  { title: 'Nội dung', dataIndex: 'content' },
                  { title: 'Số quyết định', dataIndex: 'decisionNo', width: 130 },
                  { title: 'Lớp, năm học', width: 150, render: (_, a) => join(a.class?.name, a.academicYear) },
                  {
                    title: '',
                    width: 50,
                    render: (_, a) =>
                      (me?.role === 'ADMIN' || a.createdById === me?.id) && (
                        <Popconfirm title="Xóa khen thưởng này?" onConfirm={() => call(() => api(`/students/awards/${a.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'discipline',
            label: `Kỷ luật (${data.discipline.length})`,
            children: (
              <Table<any>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data.discipline}
                scroll={{ x: 900 }}
                columns={[
                  { title: 'Ngày', dataIndex: 'date', width: 100, render: dmy },
                  { title: 'Hành vi vi phạm', dataIndex: 'violation' },
                  { title: 'Mức độ', dataIndex: 'severity', width: 70, align: 'center' },
                  { title: 'Biện pháp', dataIndex: 'measure', width: 200, render: (m) => <Tag color={DISCIPLINE_MEASURE[m].color}>{DISCIPLINE_MEASURE[m].label}</Tag> },
                  {
                    title: 'Hỗ trợ học sinh',
                    dataIndex: 'support',
                    render: (v, d) =>
                      mayDecide ? (
                        <Input.TextArea
                          autoSize
                          size="small"
                          value={support[d.id] ?? v ?? ''}
                          placeholder="Hoạt động hỗ trợ (Điều 16)"
                          onChange={(e) => setSupport({ ...support, [d.id]: e.target.value })}
                          onBlur={() => support[d.id] !== undefined && support[d.id] !== (v ?? '') && call(() => api(`/students/discipline/${d.id}`, { method: 'PATCH', body: { support: support[d.id] } }), 'Đã lưu hoạt động hỗ trợ')}
                        />
                      ) : (
                        v
                      ),
                  },
                  {
                    title: 'Gia đình xác nhận',
                    width: 170,
                    render: (_, d) =>
                      d.measure !== 'SELF_REVIEW' ? null : d.familyConfirmedAt ? (
                        <Tag color="green">Đã xác nhận {dmy(d.familyConfirmedAt)}</Tag>
                      ) : mayDecide ? (
                        <Tooltip title="Ghi nhận khi gia đình xác nhận trên giấy">
                          <Button size="small" icon={<CheckOutlined />} onClick={() => call(() => api(`/students/discipline/${d.id}`, { method: 'PATCH', body: { familyConfirmed: true } }), 'Đã ghi nhận gia đình xác nhận')}>
                            Ghi nhận
                          </Button>
                        </Tooltip>
                      ) : (
                        <Tag color="gold">Chờ xác nhận</Tag>
                      ),
                  },
                  {
                    title: '',
                    width: 50,
                    render: (_, d) =>
                      (me?.role === 'ADMIN' || d.createdById === me?.id) && (
                        <Popconfirm title="Xóa bản ghi này?" onConfirm={() => call(() => api(`/students/discipline/${d.id}`, { method: 'DELETE' }), 'Đã xóa')}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'attendance',
            label: 'Chuyên cần',
            children: (
              <>
                <Row gutter={12} style={{ marginBottom: 12 }}>
                  {[
                    ['Vắng có phép', data.attendance.excused, '#2563eb'],
                    ['Vắng không phép', data.attendance.absent, '#dc2626'],
                    ['Đi muộn', data.attendance.late, '#d97706'],
                  ].map(([label, value, color]) => (
                    <Col key={label} xs={8} md={4}>
                      <Card size="small">
                        <Statistic title={label} value={value} valueStyle={{ color, fontSize: 22 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Typography.Text type="secondary">Số buổi trong năm học {data.attendance.academicYear.name}. Đơn xin nghỉ học gần đây:</Typography.Text>
                <Table<any>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  style={{ marginTop: 8 }}
                  dataSource={data.absenceRequests}
                  columns={[
                    { title: 'Ngày nghỉ', width: 240, render: (_, r) => leaveDays(r) },
                    { title: 'Lý do', dataIndex: 'reason' },
                    { title: 'Lớp', width: 70, render: (_, r) => r.class.name },
                    { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (st) => <Tag color={ABSENCE_STATUS[st].color}>{ABSENCE_STATUS[st].label}</Tag> },
                  ]}
                />
              </>
            ),
          },
          ...(data.exemptions.length
            ? [
                {
                  key: 'exemptions',
                  label: 'Miễn học',
                  children: (
                    <Table<any>
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={data.exemptions}
                      columns={[
                        { title: 'Môn học', render: (_, e) => e.subject.name },
                        { title: 'Năm học', dataIndex: 'academicYear', width: 120 },
                        { title: 'Học kỳ', dataIndex: 'semester', width: 100, render: (x) => (x === 0 ? 'Cả năm' : `Học kỳ ${x}`) },
                        { title: 'Lý do', dataIndex: 'reason' },
                      ]}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <StudentFormModal
        student={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />
      <RecordActionModal
        action={action}
        students={picked}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          mutate();
        }}
      />
    </>
  );
}

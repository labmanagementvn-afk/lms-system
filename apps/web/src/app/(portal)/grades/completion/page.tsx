'use client';

import { CheckCircleOutlined, EditOutlined, SafetyCertificateOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { CouncilModal, RecognizeModal, StudentModal } from '@/components/grades/completion/CompletionForms';
import { ReportButtons } from '@/components/grades/control/ReportButtons';
import { ResultLevelTag } from '@/components/grades/ResultLevelTag';
import { CompletionOverview, CompletionStudent, dmy, slug } from '@/components/grades/review/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';

/** Recognised, eligible, or the conditions still missing. */
function Status({ s }: { s: CompletionStudent }) {
  if (s.recognized)
    return (
      <Tag color="green" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
        Đợt {s.recognized.round} · số {s.recognized.registerNo}
      </Tag>
    );
  if (s.eligible)
    return (
      <Tag color="blue" style={{ margin: 0 }}>
        Đủ điều kiện
      </Tag>
    );
  return (
    <Space size={4} wrap>
      {s.gaps.map((g) => (
        <Tag key={g} color="red" style={{ margin: 0 }}>
          {g}
        </Tag>
      ))}
    </Space>
  );
}

/**
 * Xét công nhận hoàn thành chương trình giáo dục THCS: the grade 9 students
 * against the conditions, the council of each round, the decision and the
 * papers it prints. The office keeps the council and the dossiers; the
 * principal (admin) records the decision.
 */
export default function CompletionPage() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const admin = me?.role === 'ADMIN';
  const office = admin || me?.role === 'STAFF';
  const { data: classes } = useClasses();
  const [round, setRound] = useState(1);
  const [classId, setClassId] = useState<string>();
  const { data, isLoading, mutate } = useSWR<CompletionOverview>(['/grades/completion', { round, classId }]);
  const [editingCouncil, setEditingCouncil] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [student, setStudent] = useState<CompletionStudent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const grade9 = useMemo(() => (classes ?? []).filter((c) => c.gradeLevel === 9), [classes]);
  const className = grade9.find((c) => c.id === classId)?.name;

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      await mutate();
      message.success(done);
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }
  const saveCouncil = async (body: unknown) => {
    if (await run('council', () => api(`/grades/completion/rounds/${round}`, { method: 'PUT', body }), 'Đã lưu Hội đồng')) setEditingCouncil(false);
  };
  const recognize = async (body: unknown) => {
    if (await run('recognize', () => api(`/grades/completion/rounds/${round}/recognize`, { method: 'POST', body }), 'Đã ghi quyết định công nhận')) setRecognizing(false);
  };
  const cancel = () => run('cancel', () => api(`/grades/completion/rounds/${round}/recognize`, { method: 'DELETE' }), 'Đã hủy quyết định');
  const saveStudent = async (body: unknown) => {
    if (student && (await run('student', () => api(`/grades/completion/students/${student.id}`, { method: 'PUT', body }), 'Đã lưu hồ sơ'))) setStudent(null);
  };

  const r = data?.round;
  const first = data?.rounds[0];
  const blockedByFirst = round === 2 && !first?.recognizedAt;
  const year = data?.academicYear.name ?? '';
  const file = (name: string) => slug(`${name}-dot-${round}-${year}`);

  const columns: ColumnsType<CompletionStudent> = [
    { title: '#', width: 44, render: (_, __, i) => i + 1 },
    { title: 'Họ và tên', width: 180, render: (_, s) => <Link href={`/grades/transcript/${s.id}`}>{s.fullName}</Link> },
    { title: 'Ngày sinh', width: 100, align: 'center', render: (_, s) => dmy(s.dateOfBirth) },
    { title: 'Lớp', width: 60, align: 'center', render: (_, s) => s.class.name },
    { title: 'Rèn luyện', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.conduct} /> },
    { title: 'Học tập', width: 90, align: 'center', render: (_, s) => <ResultLevelTag level={s.academic} /> },
    { title: 'Nghỉ', width: 56, align: 'center', dataIndex: 'absentDays' },
    {
      title: 'Hồ sơ',
      width: 90,
      align: 'center',
      render: (_, s) => (
        <Tooltip title={s.note ?? undefined}>
          <Tag color={s.dossierComplete ? 'default' : 'warning'} style={{ margin: 0 }}>
            {s.dossierComplete ? 'Đủ' : 'Chưa đủ'}
          </Tag>
        </Tooltip>
      ),
    },
    { title: 'Diện ưu tiên', width: 130, render: (_, s) => s.priority ?? '' },
    { title: 'Kết quả xét', render: (_, s) => <Status s={s} /> },
    ...(office
      ? ([
          {
            title: '',
            width: 52,
            render: (_, s) => (
              <Tooltip title="Hồ sơ, diện ưu tiên">
                <Button size="small" icon={<EditOutlined />} onClick={() => setStudent(s)} />
              </Tooltip>
            ),
          },
        ] as ColumnsType<CompletionStudent>)
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Xét công nhận hoàn thành chương trình THCS"
        extra={
          <Space wrap>
            <Segmented
              value={round}
              onChange={(v) => setRound(Number(v))}
              options={[
                { value: 1, label: 'Đợt 1 (cuối năm học)' },
                { value: 2, label: 'Đợt 2 (sau hè)' },
              ]}
            />
            <Select allowClear placeholder="Cả khối 9" value={classId} onChange={setClassId} style={{ width: 140 }} options={grade9.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
          </Space>
        }
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Theo Luật Giáo dục sửa đổi năm 2025, học sinh lớp 9 không còn được cấp bằng tốt nghiệp THCS"
        description="Hội đồng của trường xét công nhận học sinh lớp 9 hoàn thành chương trình giáo dục THCS (đợt 1 trước khi kết thúc năm học, đợt 2 sau kiểm tra lại và rèn luyện hè); Hiệu trưởng xác nhận vào học bạ. Điều kiện: rèn luyện và học tập cả năm từ mức Đạt, không có môn Chưa đạt, nghỉ không quá 45 buổi, không quá 21 tuổi, hồ sơ đầy đủ."
      />
      {!data ? (
        isLoading ? null : <Empty />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title={`Hội đồng xét · Đợt ${round}`}
                extra={
                  office && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditingCouncil(true)}>
                      Sửa
                    </Button>
                  )
                }
                style={{ height: '100%' }}
              >
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    { key: 'no', label: 'Quyết định thành lập', children: r?.councilDecisionNo ? `Số ${r.councilDecisionNo}${r.councilDecidedOn ? ` ngày ${dmy(r.councilDecidedOn)}` : ''}` : <Typography.Text type="secondary">Chưa nhập</Typography.Text> },
                    { key: 'at', label: 'Họp', children: r?.meetingAt ? `${dayjs(r.meetingAt).format('HH:mm DD/MM/YYYY')}${r.meetingPlace ? `, ${r.meetingPlace}` : ''}` : <Typography.Text type="secondary">Chưa nhập</Typography.Text> },
                    {
                      key: 'members',
                      label: 'Thành viên',
                      children: r?.members.length ? (
                        <div>
                          {r.members.map((m, i) => (
                            <div key={i}>
                              {m.name} <Typography.Text type="secondary">({[m.position, m.role].filter(Boolean).join(', ')})</Typography.Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Typography.Text type="secondary">Chưa nhập</Typography.Text>
                      ),
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title={`Quyết định công nhận · Đợt ${round}`} style={{ height: '100%' }}>
                {r?.recognizedAt ? (
                  <>
                    <Descriptions
                      size="small"
                      column={1}
                      items={[
                        { key: 'no', label: 'Quyết định', children: `Số ${r.decisionNo} ngày ${dmy(r.decidedOn)}` },
                        { key: 'signer', label: 'Người ký', children: [r.signerTitle, r.signerName].filter(Boolean).join(': ') },
                        { key: 'n', label: 'Số học sinh', children: data.rounds[round - 1]?.recognized ?? 0 },
                      ]}
                    />
                    {admin && (
                      <Popconfirm title="Hủy quyết định công nhận của đợt này?" description="Học sinh trở lại danh sách xét, số vào sổ được xóa." okText="Hủy quyết định" cancelText="Không" onConfirm={cancel}>
                        <Button danger icon={<UndoOutlined />} loading={busy === 'cancel'} style={{ marginTop: 8 }}>
                          Hủy quyết định
                        </Button>
                      </Popconfirm>
                    )}
                  </>
                ) : (
                  <Space direction="vertical">
                    <Typography.Text>
                      {blockedByFirst
                        ? 'Đợt 2 xét sau khi đợt 1 đã có quyết định công nhận.'
                        : classId
                          ? 'Quyết định công nhận áp dụng cho cả khối 9: bỏ chọn lớp để ghi quyết định.'
                          : `${data.summary.eligible} học sinh đủ điều kiện, chưa có quyết định công nhận.`}
                    </Typography.Text>
                    {admin && !classId && (
                      <Button type="primary" icon={<SafetyCertificateOutlined />} disabled={blockedByFirst || !data.summary.eligible} onClick={() => setRecognizing(true)}>
                        Công nhận hoàn thành chương trình
                      </Button>
                    )}
                  </Space>
                )}
              </Card>
            </Col>
          </Row>

          <Space wrap style={{ marginBottom: 12 }}>
            <ReportButtons label="Danh sách đề nghị (DS1)" report="completion-proposed" query={{ round }} fileName={file('danh-sach-de-nghi-cong-nhan')} disabled={blockedByFirst} />
            <ReportButtons label="Danh sách chưa đủ điều kiện (DS2)" report="completion-not-eligible" query={{ round }} fileName={file('danh-sach-chua-du-dieu-kien')} disabled={blockedByFirst} />
            <ReportButtons label="Biên bản họp" report="completion-minutes" query={{ round }} fileName={file('bien-ban-hop-hoi-dong')} disabled={blockedByFirst} />
            <ReportButtons label="Quyết định" report="completion-decision" query={{ round }} fileName={file('quyet-dinh-cong-nhan')} disabled={!r?.recognizedAt} />
            <ReportButtons label="Giấy xác nhận" report="completion-certificates" query={{ classId }} fileName={slug(`giay-xac-nhan-hoan-thanh-thcs-${className ?? 'khoi-9'}-${year}`)} disabled={!data.summary.recognized} />
          </Space>
          <Space size={4} wrap style={{ marginBottom: 12, display: 'flex' }}>
            <Tag>Học sinh lớp 9: {data.summary.students}</Tag>
            <Tag color="green">Đã công nhận {data.summary.recognized}</Tag>
            <Tag color="blue">Đủ điều kiện {data.summary.eligible}</Tag>
            <Tag color="red">Chưa đủ điều kiện {data.summary.notEligible}</Tag>
          </Space>
          <Table<CompletionStudent>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={data.students}
            columns={columns}
            pagination={false}
            scroll={{ x: 1100 }}
            locale={{ emptyText: <Empty description="Không có học sinh lớp 9 trong năm học" /> }}
          />
          {r && (
            <>
              <CouncilModal round={r} open={editingCouncil} busy={busy === 'council'} onCancel={() => setEditingCouncil(false)} onSave={saveCouncil} />
              <RecognizeModal round={r} eligible={data.summary.eligible} open={recognizing} busy={busy === 'recognize'} onCancel={() => setRecognizing(false)} onSave={recognize} />
            </>
          )}
          <StudentModal student={student} busy={busy === 'student'} onCancel={() => setStudent(null)} onSave={saveStudent} />
        </>
      )}
    </>
  );
}

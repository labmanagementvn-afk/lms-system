'use client';

import { DownloadOutlined, EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Collapse, DatePicker, Empty, Form, Input, Menu, Row, Segmented, Select, Space, Spin } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { StudentSelect } from '@/components/StudentSelect';
import { downloadFile } from '@/components/grades/download';
import { Letterhead, ReportDocument, ReportPreview } from '@/components/reports/ReportPreview';
import { api } from '@/lib/api';
import { useClasses, useSubjects } from '@/lib/hooks';

type Param = 'classId' | 'subjectId' | 'studentId' | 'semester' | 'term' | 'gradeLevel' | 'from' | 'to' | 'status' | 'promotion' | 'round';
interface ReportInfo {
  key: string;
  group: string;
  name: string;
  params: Param[];
  required: Param[];
}

interface Values {
  classId?: string;
  subjectId?: string;
  studentId?: string;
  semester?: number;
  gradeLevel?: number;
  range?: [Dayjs, Dayjs];
  status?: string;
  promotion?: string;
  round?: number;
  signerTitle?: string;
  signerName?: string;
  place?: string;
}

/** Báo cáo: pick a report, fill its parameters, preview it, download PDF or Excel. */
export default function ReportsPage() {
  const { message } = App.useApp();
  const { data: catalogue } = useSWR<ReportInfo[]>(['/reports']);
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [key, setKey] = useState<string>();
  const [form] = Form.useForm<Values>();
  const [preview, setPreview] = useState<{ document: ReportDocument; letterhead: Letterhead } | null>(null);
  const [busy, setBusy] = useState<'json' | 'pdf' | 'xlsx' | null>(null);

  const report = catalogue?.find((r) => r.key === key);
  const groups = useMemo(() => [...new Set((catalogue ?? []).map((r) => r.group))], [catalogue]);
  const gradeLevels = useMemo(() => [...new Set((classes ?? []).map((c) => c.gradeLevel as number))].sort((a, b) => a - b), [classes]);

  useEffect(() => {
    if (!key && catalogue?.length) setKey(catalogue[0].key);
  }, [catalogue, key]);
  useEffect(() => {
    setPreview(null);
    const term = report?.params.includes('term');
    form.setFieldsValue({ semester: report?.params.includes('semester') || term ? 1 : undefined, round: report?.params.includes('round') ? 1 : undefined, range: [dayjs().startOf('month'), dayjs()] });
  }, [key, report, form]);

  const query = (v: Values) => ({
    classId: v.classId,
    subjectId: v.subjectId,
    studentId: v.studentId,
    semester: report?.params.some((p) => p === 'semester' || p === 'term') ? v.semester : undefined,
    gradeLevel: v.gradeLevel,
    from: report?.params.includes('from') ? v.range?.[0]?.format('YYYY-MM-DD') : undefined,
    to: report?.params.includes('to') ? v.range?.[1]?.format('YYYY-MM-DD') : undefined,
    status: v.status,
    promotion: v.promotion,
    round: report?.params.includes('round') ? v.round : undefined,
    signerTitle: v.signerTitle || undefined,
    signerName: v.signerName || undefined,
    place: v.place || undefined,
  });

  async function run(format: 'json' | 'pdf' | 'xlsx') {
    if (!report) return;
    const values = await form.validateFields();
    setBusy(format);
    try {
      if (format === 'json') setPreview(await api(`/reports/${report.key}`, { query: query(values) }));
      else await downloadFile(`/reports/${report.key}`, { ...query(values), format }, `${preview?.document.fileName ?? report.key}.${format}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const has = (p: Param) => !!report?.params.includes(p);
  const need = (p: Param) => !!report?.required.includes(p);
  const rule = (p: Param, label: string) => (need(p) ? [{ required: true, message: `Chọn ${label}` }] : []);

  return (
    <>
      <PageHeader title="Báo cáo" />
      <Row gutter={16}>
        <Col xs={24} md={7} lg={6}>
          <Card size="small" styles={{ body: { padding: 0 } }}>
            {catalogue ? (
              <Menu
                mode="inline"
                selectedKeys={key ? [key] : []}
                onClick={(e) => setKey(e.key)}
                items={groups.map((g) => ({
                  type: 'group' as const,
                  key: g,
                  label: g,
                  // Long report names wrap onto a second line instead of being cut off.
                  children: catalogue.filter((r) => r.group === g).map((r) => ({ key: r.key, label: r.name, style: { height: 'auto', lineHeight: 1.35, paddingBlock: 9, whiteSpace: 'normal' } })),
                }))}
                style={{ borderInlineEnd: 'none' }}
              />
            ) : (
              <Spin style={{ margin: 24 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={17} lg={18}>
          {report ? (
            <Card size="small" title={report.name} style={{ marginBottom: 16 }}>
              <Form form={form} layout="vertical">
                <Space wrap align="start">
                  {has('classId') && (
                    <Form.Item name="classId" label="Lớp" rules={rule('classId', 'lớp')}>
                      <Select allowClear={!need('classId')} placeholder="Chọn lớp" style={{ width: 140 }} showSearch optionFilterProp="label" options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
                    </Form.Item>
                  )}
                  {has('subjectId') && (
                    <Form.Item name="subjectId" label="Môn học" rules={rule('subjectId', 'môn học')}>
                      <Select allowClear={!need('subjectId')} placeholder="Chọn môn" style={{ width: 200 }} showSearch optionFilterProp="label" options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
                    </Form.Item>
                  )}
                  {has('studentId') && (
                    <Form.Item name="studentId" label="Học sinh" rules={rule('studentId', 'học sinh')}>
                      {/* Students who left too: their học bạ and transfer letter are printed after they go. */}
                      <StudentSelect style={{ width: 340 }} status={null} />
                    </Form.Item>
                  )}
                  {(has('semester') || has('term')) && (
                    <Form.Item name="semester" label="Học kỳ">
                      <Segmented
                        options={[
                          { value: 1, label: 'Học kỳ I' },
                          { value: 2, label: 'Học kỳ II' },
                          ...(has('term') ? [{ value: 0, label: 'Cả năm' }] : []),
                        ]}
                      />
                    </Form.Item>
                  )}
                  {has('gradeLevel') && (
                    <Form.Item name="gradeLevel" label="Khối">
                      <Select allowClear placeholder="Toàn trường" style={{ width: 130 }} options={gradeLevels.map((g) => ({ value: g, label: `Khối ${g}` }))} />
                    </Form.Item>
                  )}
                  {has('from') && (
                    <Form.Item name="range" label="Khoảng thời gian" rules={[{ required: true, message: 'Chọn khoảng thời gian' }]}>
                      <DatePicker.RangePicker format="DD/MM/YYYY" />
                    </Form.Item>
                  )}
                  {has('status') && (
                    <Form.Item name="status" label="Tình trạng" rules={rule('status', 'tình trạng')} initialValue="TRANSFERRED">
                      <Select
                        style={{ width: 180 }}
                        options={[
                          { value: 'TRANSFERRED', label: 'Chuyển trường' },
                          { value: 'DROPPED', label: 'Thôi học' },
                          { value: 'GRADUATED', label: 'Đã tốt nghiệp' },
                        ]}
                      />
                    </Form.Item>
                  )}
                  {has('round') && (
                    <Form.Item name="round" label="Đợt xét">
                      <Segmented
                        options={[
                          { value: 1, label: 'Đợt 1' },
                          { value: 2, label: 'Đợt 2' },
                        ]}
                      />
                    </Form.Item>
                  )}
                  {has('promotion') && (
                    <Form.Item name="promotion" label="Kết quả" rules={rule('promotion', 'kết quả')} initialValue="RETEST">
                      <Select
                        style={{ width: 220 }}
                        options={[
                          { value: 'RETEST', label: 'Kiểm tra lại, rèn luyện hè' },
                          { value: 'RETAINED', label: 'Ở lại lớp' },
                          { value: 'PROMOTED', label: 'Được lên lớp' },
                        ]}
                      />
                    </Form.Item>
                  )}
                </Space>
                <Collapse
                  size="small"
                  ghost
                  items={[
                    {
                      key: 'signer',
                      label: 'Người ký và nơi ký (mặc định theo thông tin trường)',
                      children: (
                        <Space wrap>
                          <Form.Item name="signerTitle" label="Chức vụ">
                            <Input placeholder="Hiệu trưởng" style={{ width: 200 }} />
                          </Form.Item>
                          <Form.Item name="signerName" label="Họ và tên người ký">
                            <Input style={{ width: 240 }} />
                          </Form.Item>
                          <Form.Item name="place" label="Địa danh">
                            <Input style={{ width: 180 }} />
                          </Form.Item>
                        </Space>
                      ),
                    },
                  ]}
                />
                <Space wrap style={{ marginTop: 8 }}>
                  <Button icon={<EyeOutlined />} onClick={() => run('json')} loading={busy === 'json'}>
                    Xem
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={() => run('xlsx')} loading={busy === 'xlsx'}>
                    Xuất Excel
                  </Button>
                  <Button type="primary" icon={<FilePdfOutlined />} onClick={() => run('pdf')} loading={busy === 'pdf'}>
                    Xuất PDF
                  </Button>
                </Space>
              </Form>
            </Card>
          ) : (
            <Empty description="Chọn một báo cáo" />
          )}
          {preview && <ReportPreview document={preview.document} letterhead={preview.letterhead} />}
        </Col>
      </Row>
    </>
  );
}

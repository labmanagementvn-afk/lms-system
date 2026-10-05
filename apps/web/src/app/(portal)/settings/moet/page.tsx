'use client';

import { DownloadOutlined, ExportOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Row, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { formatDateTime } from '@/components/lms/format';
import { PageHeader } from '@/components/PageHeader';
import { api, API_URL, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAcademicYears } from '@/lib/hooks';
import { MOET_EXPORT_KIND, MOET_EXPORT_STATUS, SEMESTER } from '@/lib/labels';

interface MoetExport {
  id: string;
  kind: string;
  academicYearId: string | null;
  semester: number | null;
  fileId: string | null;
  fileName: string;
  rows: number;
  status: string;
  error: string | null;
  createdAt: string;
}

interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  enrolled: number;
  guardians: number;
  unknownClasses: string[];
  errors: { line: number; message: string }[];
  dryRun: boolean;
}

const downloadUrl = (id: string) => `${API_URL}/moet/exports/${id}/download?access_token=${encodeURIComponent(getToken() ?? '')}`;

/** Dữ liệu CSDL ngành: build the MOET exchange files and import a student list in the same template. */
export default function MoetPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const tz = me!.school.timezone;
  const years = useAcademicYears();
  const { data, isLoading, mutate } = useSWR<{ items: MoetExport[]; total: number }>(['/moet/exports', { pageSize: 50 }]);
  const [yearId, setYearId] = useState<string>();
  const [semester, setSemester] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);

  async function exportKind(kind: string) {
    setBusy(kind);
    try {
      const r = await api<MoetExport>('/moet/exports', { method: 'POST', body: { kind, academicYearId: yearId, semester } });
      if (r.status === 'DONE') message.success(`Đã tạo ${r.fileName} (${r.rows} dòng)`);
      else message.error(`Xuất thất bại: ${r.error}`);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runImport(dryRun: boolean) {
    if (!csv) return;
    setImporting(true);
    try {
      const r = await api<ImportSummary>('/moet/import/students', { method: 'POST', body: { csv: csv.text, dryRun } });
      setResult(r);
      if (!dryRun) {
        message.success(`Đã nhập: ${r.created} học sinh mới, ${r.updated} cập nhật`);
        setCsv(null);
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader title="Dữ liệu CSDL ngành GDĐT" />
      <Typography.Paragraph type="secondary">
        Tệp xuất theo mẫu trao đổi của cơ sở dữ liệu ngành (CSV, UTF-8, mở được bằng Excel) để tải lên cổng của Phòng/Sở. Mã trường dùng trong tệp là mã CSDL ngành khai báo ở
        mục Trường học.
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <span>Năm học:</span>
        <Select
          style={{ width: 160 }}
          placeholder="Năm học hiện tại"
          allowClear
          value={yearId}
          onChange={setYearId}
          options={(years.data ?? []).map((y: any) => ({ value: y.id, label: y.name + (y.isCurrent ? ' (hiện tại)' : '') }))}
        />
        <span>Học kỳ (kết quả học kỳ):</span>
        <Select style={{ width: 130 }} value={semester} onChange={setSemester} options={[1, 2, 0].map((s) => ({ value: s, label: SEMESTER[s] }))} />
      </Space>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {Object.entries(MOET_EXPORT_KIND).map(([kind, k]) => (
          <Col xs={24} sm={12} lg={6} key={kind}>
            <Card size="small" title={k.label} extra={<Button size="small" type="primary" icon={<ExportOutlined />} loading={busy === kind} onClick={() => exportKind(kind)}>Xuất</Button>}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {k.hint}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Typography.Title level={5}>Lịch sử xuất</Typography.Title>
      <Table<MoetExport>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={false}
        style={{ marginBottom: 24 }}
        locale={{ emptyText: 'Chưa xuất tệp nào' }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (d: string) => formatDateTime(d, tz) },
          { title: 'Loại', dataIndex: 'kind', width: 170, render: (k: string, r) => `${MOET_EXPORT_KIND[k]?.label ?? k}${r.semester !== null ? ` · ${SEMESTER[r.semester]}` : ''}` },
          { title: 'Tệp', dataIndex: 'fileName', render: (f: string, r) => (r.fileId ? <a href={downloadUrl(r.id)}>{f}</a> : f) },
          { title: 'Số dòng', dataIndex: 'rows', width: 90, align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', width: 100, render: (s: string, r) => <Tag color={MOET_EXPORT_STATUS[s]?.color} title={r.error ?? undefined}>{MOET_EXPORT_STATUS[s]?.label ?? s}</Tag> },
          { title: '', width: 60, render: (_, r) => r.fileId && <Button size="small" type="text" icon={<DownloadOutlined />} href={downloadUrl(r.id)} /> },
        ]}
      />

      <Typography.Title level={5}>Nhập danh sách học sinh</Typography.Title>
      <Typography.Paragraph type="secondary">
        Tệp CSV theo mẫu học sinh của CSDL ngành (các cột được nhận diện theo tên, thứ tự không quan trọng). Học sinh được cập nhật theo mã; mã mới được tạo thêm; cột
        &quot;Lớp&quot; xếp học sinh vào lớp cùng tên của năm học hiện tại. <a href={`${API_URL}/moet/import/students/template?access_token=${encodeURIComponent(getToken() ?? '')}`}>Tải mẫu</a>
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((text) => {
                setCsv({ name: file.name, text });
                setResult(null);
              });
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{csv ? csv.name : 'Kéo thả hoặc bấm để chọn tệp CSV'}</p>
          </Upload.Dragger>
          <Space style={{ marginTop: 12 }}>
            <Button disabled={!csv} loading={importing} onClick={() => runImport(true)}>
              Kiểm tra
            </Button>
            <Button type="primary" disabled={!csv || !result || !result.dryRun || result.errors.length > 0} loading={importing} onClick={() => runImport(false)}>
              Nhập dữ liệu
            </Button>
          </Space>
        </Col>
        <Col xs={24} md={14}>
          {result && (
            <>
              <Alert
                type={result.errors.length ? 'warning' : 'success'}
                showIcon
                style={{ marginBottom: 12 }}
                message={result.dryRun ? (result.errors.length ? 'Tệp có lỗi, sửa rồi kiểm tra lại trước khi nhập' : 'Tệp hợp lệ, có thể nhập') : 'Đã nhập dữ liệu'}
                description={
                  <Descriptions size="small" column={{ xs: 2, md: 4 }}>
                    <Descriptions.Item label="Dòng hợp lệ">{result.total}</Descriptions.Item>
                    <Descriptions.Item label="Tạo mới">{result.created}</Descriptions.Item>
                    <Descriptions.Item label="Cập nhật">{result.updated}</Descriptions.Item>
                    <Descriptions.Item label="Xếp lớp">{result.enrolled}</Descriptions.Item>
                    <Descriptions.Item label="Thêm người giám hộ">{result.guardians}</Descriptions.Item>
                    {result.unknownClasses.length > 0 && <Descriptions.Item label="Lớp không tồn tại">{result.unknownClasses.join(', ')}</Descriptions.Item>}
                  </Descriptions>
                }
              />
              {result.errors.length > 0 && (
                <Table size="small" rowKey="line" pagination={false} dataSource={result.errors} columns={[{ title: 'Dòng', dataIndex: 'line', width: 70 }, { title: 'Lỗi', dataIndex: 'message' }]} />
              )}
            </>
          )}
        </Col>
      </Row>
    </>
  );
}

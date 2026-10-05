'use client';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readFileAsText, saveTextFile } from './shared';

const TEMPLATE_HEADER = 'Họ tên,Giới tính,Ngày sinh,Địa chỉ,Trường cũ,Người giám hộ,SĐT,Email,Quan hệ,Ghi chú';
const TEMPLATE = `${TEMPLATE_HEADER}\r\nNguyễn Văn An,Nam,01/09/2016,"Cầu Giấy, Hà Nội",Tiểu học Kim Đồng,Nguyễn Văn Bình,0903123456,binh@example.com,Cha,\r\n`;

/** Imports applications from a CSV file or pasted text and shows what happened to each row. */
export function ImportModal({ open, rounds, defaultRoundId, onClose, onDone }: { open: boolean; rounds?: any[]; defaultRoundId?: string; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const [roundId, setRoundId] = useState<string | undefined>(defaultRoundId);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);

  useEffect(() => {
    if (open) {
      setRoundId(defaultRoundId ?? rounds?.find((r) => r.status === 'OPEN')?.id);
      setCsv('');
      setFileName(undefined);
      setResult(null);
    }
  }, [open, defaultRoundId, rounds]);

  async function submit() {
    if (!roundId || !csv.trim()) return;
    setBusy(true);
    try {
      const r = await api('/admissions/applications/import', { method: 'POST', body: { roundId, csv } });
      setResult(r);
      if (r.created) {
        message.success(`Đã nhập ${r.created} hồ sơ`);
        onDone();
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nhập hồ sơ từ CSV"
      open={open}
      onCancel={onClose}
      width={720}
      footer={
        <Space>
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" onClick={submit} loading={busy} disabled={!roundId || !csv.trim()}>
            Nhập hồ sơ
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label="Đợt tuyển sinh" required>
          <Select value={roundId} onChange={setRoundId} options={rounds?.filter((r) => r.status === 'OPEN').map((r) => ({ value: r.id, label: r.name }))} placeholder="Chọn đợt" />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          File CSV (UTF-8, phân cách bằng dấu phẩy hoặc chấm phẩy) có dòng tiêu đề: <code>{TEMPLATE_HEADER}</code>. Ngày sinh dạng <code>dd/mm/yyyy</code>, giới tính Nam/Nữ. Hồ sơ trùng (cùng họ tên,
          ngày sinh, SĐT trong đợt) sẽ được bỏ qua.{' '}
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => saveTextFile(TEMPLATE, 'mau-ho-so-tuyen-sinh.csv')} style={{ padding: 0 }}>
            Tải file mẫu
          </Button>
        </Typography.Paragraph>
        <Upload.Dragger
          accept=".csv,text/csv,text/plain"
          maxCount={1}
          showUploadList={false}
          beforeUpload={async (file) => {
            try {
              setCsv(await readFileAsText(file));
              setFileName(file.name);
              setResult(null);
            } catch (e) {
              message.error((e as Error).message);
            }
            return Upload.LIST_IGNORE;
          }}
          style={{ marginBottom: 12 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{fileName ? `Đã chọn: ${fileName}` : 'Kéo thả hoặc bấm để chọn file CSV'}</p>
        </Upload.Dragger>
        <Form.Item label="Hoặc dán nội dung CSV">
          <Input.TextArea
            rows={6}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(undefined);
              setResult(null);
            }}
            placeholder={TEMPLATE}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
      </Form>
      {result && (
        <>
          <Alert
            type={result.errors.length ? 'warning' : 'success'}
            showIcon
            message={`Đã tạo ${result.created} hồ sơ, bỏ qua ${result.skipped} hồ sơ trùng${result.errors.length ? `, ${result.errors.length} dòng lỗi` : ''}`}
            style={{ marginBottom: 12 }}
          />
          {result.errors.length > 0 && (
            <Table<{ row: number; message: string }>
              size="small"
              rowKey="row"
              pagination={false}
              dataSource={result.errors}
              scroll={{ y: 200 }}
              columns={[
                { title: 'Dòng', dataIndex: 'row', width: 70 },
                { title: 'Lỗi', dataIndex: 'message' },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
}

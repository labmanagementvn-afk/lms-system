'use client';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Input, Modal, Space, Table, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { readFileAsText, saveTextFile } from '@/components/admissions/shared';
import { api } from '@/lib/api';

const HEADER = 'type,content,optionA,optionB,optionC,optionD,answer,difficulty,subjectCode,gradeLevel,tags,explanation';
const TEMPLATE = [
  HEADER,
  'SINGLE_CHOICE,Kết quả của phép tính 1/2 + 1/3 là,2/5,5/6,1/6,3/5,B,2,TOAN,6,phân số;chương 1,Quy đồng mẫu 6: 3/6 + 2/6 = 5/6.',
  'MULTIPLE_CHOICE,Những số nào chia hết cho 3?,12,14,21,25,A;C,2,TOAN,6,dấu hiệu chia hết,',
  'TRUE_FALSE,Số 0 là số nguyên tố.,,,,,false,1,TOAN,6,số tự nhiên,',
  'FILL_BLANK,Số đối của 5 là ___ và số đối của -3 là ___.,,,,,-5|3;+3,3,TOAN,6,số nguyên,',
  'SHORT_ANSWER,Thủ đô của Việt Nam là thành phố nào?,,,,,Hà Nội;Ha Noi,1,,6,,',
  'NUMERIC,Tính 3/4 của 80.,,,,,60,2,TOAN,6,phân số,',
  'ORDERING,Sắp xếp các phân số theo thứ tự tăng dần.,3/4,1/2,5/8,1/4,D;B;C;A,3,TOAN,6,phân số,',
  'ESSAY,Viết đoạn văn ngắn về người bạn thân của em.,,,,,,5,VAN,6,viết,',
].join('\r\n');

/** Imports bank questions from CSV and lists the rows that were rejected. */
export function ImportQuestionsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { line: number; message: string }[] } | null>(null);

  useEffect(() => {
    if (open) {
      setCsv('');
      setFileName(undefined);
      setResult(null);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const r = await api('/lms/questions/import', { method: 'POST', body: { csv } });
      setResult(r);
      if (r.created) {
        message.success(`Đã thêm ${r.created} câu hỏi`);
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
      title="Nhập câu hỏi từ CSV"
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" onClick={submit} loading={busy} disabled={!csv.trim()}>
            Nhập câu hỏi
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        File CSV (UTF-8, phân cách bằng dấu phẩy hoặc chấm phẩy) có dòng tiêu đề <code>{HEADER}</code>. Cột <code>answer</code>: mã phương án (B), nhiều mã cách nhau bằng dấu chấm phẩy (A;C), true/false, thứ tự
        đúng (D;B;C;A), các đáp án chấp nhận (Hà Nội;Ha Noi), hoặc với câu điền chỗ trống thì mỗi chỗ trống cách nhau bằng <code>|</code>. Câu ghép đôi nhập trên màn hình.{' '}
        <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => saveTextFile(TEMPLATE + '\r\n', 'mau-ngan-hang-cau-hoi.csv')} style={{ padding: 0 }}>
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
      <Form layout="vertical">
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
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
      </Form>
      {result && (
        <>
          <Alert type={result.errors.length ? 'warning' : 'success'} showIcon message={`Đã thêm ${result.created} câu hỏi${result.errors.length ? `, ${result.errors.length} dòng lỗi được bỏ qua` : ''}`} style={{ marginBottom: 12 }} />
          {result.errors.length > 0 && (
            <Table<{ line: number; message: string }>
              size="small"
              rowKey="line"
              pagination={false}
              dataSource={result.errors}
              scroll={{ y: 200 }}
              columns={[
                { title: 'Dòng', dataIndex: 'line', width: 70 },
                { title: 'Lỗi', dataIndex: 'message' },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
}

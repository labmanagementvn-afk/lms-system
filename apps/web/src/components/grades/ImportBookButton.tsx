'use client';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, List, Modal, Typography, Upload } from 'antd';
import { useState } from 'react';
import { apiUpload } from '@/lib/api';

interface ImportResult {
  students: number;
  marks: number;
  changes: number;
  errors: { row: number; message: string }[];
  saved: boolean;
}

/**
 * Nhập điểm từ Excel: checks the file first (dry run), shows what will change
 * and any bad rows, then saves on confirmation.
 */
export function ImportBookButton({ classId, subjectId, semester, disabled, onImported }: { classId: string; subjectId: string; semester: number; disabled?: boolean; onImported: () => void }) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const path = (dryRun: boolean) => `/grades/book/import?${new URLSearchParams({ classId, subjectId, semester: String(semester), dryRun: String(dryRun) })}`;

  async function pick(f: File) {
    setBusy(true);
    try {
      setFile(f);
      setCheck(await apiUpload<ImportResult>(path(true), f));
    } catch (e) {
      message.error((e as Error).message);
      setFile(null);
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    try {
      const res = await apiUpload<ImportResult>(path(false), file);
      if (!res.saved) {
        setCheck(res);
        return;
      }
      message.success(`Đã nhập ${res.changes} điểm thay đổi của ${res.students} học sinh`);
      close();
      onImported();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setFile(null);
    setCheck(null);
  }

  return (
    <>
      <Upload accept=".xlsx" showUploadList={false} beforeUpload={pick} disabled={disabled}>
        <Button icon={<UploadOutlined />} loading={busy && !check} disabled={disabled}>
          Nhập từ Excel
        </Button>
      </Upload>
      <Modal
        open={!!check}
        title="Nhập điểm từ Excel"
        onCancel={close}
        onOk={confirm}
        okText="Lưu điểm"
        cancelText="Hủy"
        confirmLoading={busy}
        okButtonProps={{ disabled: !check || check.errors.length > 0 || check.marks === 0 }}
      >
        {check && (
          <>
            <Typography.Paragraph>
              Tệp <b>{file?.name}</b>: {check.marks} điểm của {check.students} học sinh, trong đó <b>{check.changes}</b> điểm khác với sổ điểm hiện tại. Ô trống trong tệp được giữ nguyên.
            </Typography.Paragraph>
            {check.errors.length > 0 ? (
              <>
                <Alert type="error" showIcon message={`${check.errors.length} dòng có lỗi; sửa tệp rồi tải lại.`} style={{ marginBottom: 8 }} />
                <List size="small" bordered dataSource={check.errors} style={{ maxHeight: 260, overflow: 'auto' }} renderItem={(e) => <List.Item>Dòng {e.row}: {e.message}</List.Item>} />
              </>
            ) : (
              <Alert type="success" showIcon message="Tệp hợp lệ. Bấm Lưu điểm để ghi vào sổ." />
            )}
          </>
        )}
      </Modal>
    </>
  );
}

'use client';

import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { App, Button, Space, Tooltip } from 'antd';
import { useState } from 'react';
import { downloadFile } from '@/components/grades/download';

/**
 * Excel and PDF downloads of one official report (see the Báo cáo page) for what
 * the screen shows. With a label, one compact button: the PDF named, Excel beside it.
 */
export function ReportButtons({ report, query, fileName, disabled, label }: { report: string; query: Record<string, unknown>; fileName: string; disabled?: boolean; label?: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  async function download(format: 'pdf' | 'xlsx') {
    setBusy(format);
    try {
      await downloadFile(`/reports/${report}`, { ...query, format }, `${fileName}.${format}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (label)
    return (
      <Space.Compact>
        <Button icon={<FilePdfOutlined />} loading={busy === 'pdf'} disabled={disabled} onClick={() => download('pdf')}>
          {label}
        </Button>
        <Tooltip title="Tải Excel">
          <Button icon={<FileExcelOutlined />} loading={busy === 'xlsx'} disabled={disabled} onClick={() => download('xlsx')} />
        </Tooltip>
      </Space.Compact>
    );
  return (
    <Space>
      <Button icon={<FileExcelOutlined />} loading={busy === 'xlsx'} disabled={disabled} onClick={() => download('xlsx')}>
        Excel
      </Button>
      <Button icon={<FilePdfOutlined />} loading={busy === 'pdf'} disabled={disabled} onClick={() => download('pdf')}>
        PDF
      </Button>
    </Space>
  );
}

'use client';

import { Descriptions, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

type Cell = string | number | null;
interface Column {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  group?: string;
}
export type Block =
  | { type: 'table'; caption?: string; columns: Column[]; rows: Cell[][] }
  | { type: 'text'; lines: string[]; bold?: boolean; italic?: boolean }
  | { type: 'fields'; fields: [string, Cell][] };

export interface ReportDocument {
  fileName: string;
  title: string;
  subtitles?: string[];
  orientation?: 'portrait' | 'landscape';
  blocks: Block[];
  signature?: boolean;
}

export interface Letterhead {
  governingBody?: string | null;
  schoolName: string;
  place?: string | null;
  signerTitle?: string | null;
  signerName?: string | null;
  date: string;
}

const show = (v: Cell) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v);

/** Columns with a shared group become one antd column with children, like the merged header in the PDF. */
function tableColumns(columns: Column[]): ColumnsType<Cell[]> {
  const out: ColumnsType<Cell[]> = [];
  columns.forEach((c, i) => {
    const col = { title: c.header, key: String(i), align: c.align ?? 'left', width: Math.round((c.width ?? 1) * 70), render: (_: unknown, row: Cell[]) => show(row[i]) };
    const last = out[out.length - 1] as { title?: unknown; children?: unknown[] } | undefined;
    if (c.group && last?.children && last.title === c.group) last.children.push(col);
    else if (c.group) out.push({ title: c.group, key: `g${i}`, children: [col] } as never);
    else out.push(col as never);
  });
  return out;
}

function dateLine(lh: Letterhead) {
  const d = new Date(lh.date);
  const when = `ngày ${String(d.getDate()).padStart(2, '0')} tháng ${d.getMonth() + 1 <= 2 ? String(d.getMonth() + 1).padStart(2, '0') : d.getMonth() + 1} năm ${d.getFullYear()}`;
  return lh.place ? `${lh.place}, ${when}` : when;
}

/** On-screen preview of a report, laid out like the printed form. */
export function ReportPreview({ document: doc, letterhead }: { document: ReportDocument; letterhead: Letterhead }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: 24, fontFamily: '"Times New Roman", Times, serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ flex: '0 1 45%' }}>
          {letterhead.governingBody && <div style={{ textTransform: 'uppercase' }}>{letterhead.governingBody}</div>}
          <div style={{ fontWeight: 700, textTransform: 'uppercase', textDecoration: 'underline' }}>{letterhead.schoolName}</div>
        </div>
        <div style={{ flex: '0 1 55%' }}>
          <div style={{ fontWeight: 700 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Độc lập - Tự do - Hạnh phúc</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, textTransform: 'uppercase' }}>{doc.title}</div>
        {doc.subtitles?.map((s) => (
          <div key={s} style={{ fontStyle: 'italic' }}>
            {s}
          </div>
        ))}
      </div>
      {doc.blocks.map((b, i) => {
        if (b.type === 'text')
          return (
            <div key={i} style={{ margin: '8px 0', fontWeight: b.bold ? 700 : undefined, fontStyle: b.italic ? 'italic' : undefined }}>
              {b.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          );
        if (b.type === 'fields')
          return (
            <Descriptions key={i} size="small" column={2} style={{ marginBottom: 12 }} items={b.fields.map(([label, value]) => ({ key: label, label, children: <b>{show(value)}</b> }))} />
          );
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            {b.caption && <Typography.Text strong>{b.caption}</Typography.Text>}
            <Table<Cell[]> size="small" bordered pagination={false} rowKey={(_, j) => String(j)} columns={tableColumns(b.columns)} dataSource={b.rows} scroll={{ x: 'max-content' }} locale={{ emptyText: 'Không có dữ liệu' }} />
          </div>
        );
      })}
      {doc.signature !== false && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ width: '45%', textAlign: 'center' }}>
            <div style={{ fontStyle: 'italic' }}>{dateLine(letterhead)}</div>
            <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>{letterhead.signerTitle ?? 'Hiệu trưởng'}</div>
            <div style={{ fontStyle: 'italic', fontSize: 12 }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
            <div style={{ height: 56 }} />
            <div style={{ fontWeight: 700 }}>{letterhead.signerName}</div>
          </div>
        </div>
      )}
    </div>
  );
}

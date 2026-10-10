'use client';

import { Descriptions, Divider, Table, Typography } from 'antd';
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
  | { type: 'text'; lines: string[]; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'justify'; size?: number }
  | { type: 'fields'; fields: [string, Cell][] };

export interface Signer {
  title: string;
  name?: string | null;
  hint?: string;
}

/** One printed document: letterhead, title, blocks and the signature. */
export interface ReportPage {
  title: string;
  subtitles?: string[];
  subtitleStyle?: 'italic' | 'bold';
  number?: string;
  date?: string;
  dateAtTop?: boolean;
  blocks: Block[];
  signature?: boolean;
  signer?: Signer;
  cosigner?: Signer;
  footnote?: string[];
}

export interface ReportDocument extends ReportPage {
  fileName: string;
  orientation?: 'portrait' | 'landscape';
  /** Further documents: the list attached to a decision, or one certificate per student. */
  pages?: ReportPage[];
  /** 'pages': the PDF prints only `pages` (certificates); the main page is the Excel sheet and this preview. */
  pdf?: 'all' | 'pages';
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

function dateLine(place: string | null | undefined, iso: string) {
  const d = new Date(iso);
  const when = `ngày ${String(d.getDate()).padStart(2, '0')} tháng ${d.getMonth() + 1 <= 2 ? String(d.getMonth() + 1).padStart(2, '0') : d.getMonth() + 1} năm ${d.getFullYear()}`;
  return place ? `${place}, ${when}` : when;
}

/** Title in capitals, the hint in brackets, room to sign, then the name. */
function SignerBlock({ signer, hint }: { signer: Signer; hint: string }) {
  return (
    <>
      <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>{signer.title}</div>
      <div style={{ fontStyle: 'italic', fontSize: 12 }}>{signer.hint ?? hint}</div>
      <div style={{ height: 56 }} />
      <div style={{ fontWeight: 700 }}>{signer.name}</div>
    </>
  );
}

/** One page laid out like the printed form: letterhead, title, blocks and signatures. */
function Page({ page, letterhead }: { page: ReportPage; letterhead: Letterhead }) {
  const date = dateLine(letterhead.place, page.date ?? letterhead.date);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ flex: '0 1 45%' }}>
          {letterhead.governingBody && <div style={{ textTransform: 'uppercase' }}>{letterhead.governingBody}</div>}
          <div style={{ fontWeight: 700, textTransform: 'uppercase', textDecoration: 'underline' }}>{letterhead.schoolName}</div>
          {page.number && <div style={{ marginTop: 4 }}>{page.number}</div>}
        </div>
        <div style={{ flex: '0 1 55%' }}>
          <div style={{ fontWeight: 700 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style={{ fontWeight: 700, textDecoration: 'underline' }}>Độc lập - Tự do - Hạnh phúc</div>
          {page.dateAtTop && <div style={{ fontStyle: 'italic', marginTop: 4 }}>{date}</div>}
        </div>
      </div>
      {(page.title || !!page.subtitles?.length) && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {page.title && <div style={{ fontWeight: 700, fontSize: 18, textTransform: 'uppercase' }}>{page.title}</div>}
          {page.subtitles?.map((s) => (
            <div key={s} style={page.subtitleStyle === 'bold' ? { fontWeight: 700 } : { fontStyle: 'italic' }}>
              {s}
            </div>
          ))}
        </div>
      )}
      {page.blocks.map((b, i) => {
        if (b.type === 'text')
          return (
            <div
              key={i}
              style={{
                margin: '8px 0',
                fontWeight: b.bold ? 700 : undefined,
                fontStyle: b.italic ? 'italic' : undefined,
                textAlign: b.align ?? 'left',
                // PDF point sizes; 11 pt is the body text.
                fontSize: b.size ? Math.round(b.size * 1.3) : undefined,
                lineHeight: b.size && b.size > 20 ? 1.2 : undefined,
              }}
            >
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
      {page.signature !== false && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 16 }}>
          <div style={{ width: '45%', textAlign: page.cosigner ? 'center' : 'left' }}>
            {page.cosigner ? (
              <>
                {!page.dateAtTop && <div>&nbsp;</div>}
                <SignerBlock signer={page.cosigner} hint="(Ký, ghi rõ họ tên)" />
              </>
            ) : (
              page.footnote?.map((line, i) => (
                <div key={line} style={i === 0 ? { fontWeight: 700, fontStyle: 'italic' } : { fontSize: 12 }}>
                  {line}
                </div>
              ))
            )}
          </div>
          <div style={{ width: '45%', textAlign: 'center' }}>
            {!page.dateAtTop && <div style={{ fontStyle: 'italic' }}>{date}</div>}
            <SignerBlock signer={page.signer ?? { title: letterhead.signerTitle ?? 'Hiệu trưởng', name: letterhead.signerName }} hint="(Ký, ghi rõ họ tên và đóng dấu)" />
          </div>
        </div>
      )}
    </>
  );
}

/** On-screen preview of a report, laid out like the printed form, with the pages that follow it. */
export function ReportPreview({ document: doc, letterhead }: { document: ReportDocument; letterhead: Letterhead }) {
  const certificates = doc.pdf === 'pages' && !!doc.pages?.length;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: 24, fontFamily: '"Times New Roman", Times, serif' }}>
      <Page page={doc} letterhead={letterhead} />
      {certificates ? (
        <>
          <Divider plain style={{ fontFamily: 'inherit' }}>
            Trang đầu của bản PDF ({doc.pages!.length} trang)
          </Divider>
          <Page page={doc.pages![0]} letterhead={letterhead} />
        </>
      ) : (
        doc.pages?.map((p, i) => (
          <div key={i}>
            <Divider />
            <Page page={p} letterhead={letterhead} />
          </div>
        ))
      )}
    </div>
  );
}

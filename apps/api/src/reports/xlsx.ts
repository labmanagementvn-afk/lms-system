import { Cell, cellText, dateLine, headerLayout, Letterhead, ReportDocument } from './document';

// The same report as an .xlsx workbook: letterhead, title, bordered tables and
// the signature block, in Times New Roman like the PDF.

/** exceljs loads with the first workbook rather than at startup, which keeps the API small on a 512 MB demo. */
const loadExcel = () => import('exceljs').then((m) => m.default);

const FONT = 'Times New Roman';
const thin = { style: 'thin' as const };
const border = { top: thin, left: thin, bottom: thin, right: thin };

export async function renderXlsx(report: ReportDocument, letterhead: Letterhead): Promise<Buffer> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = letterhead.schoolName;
  const ws = wb.addWorksheet('Báo cáo', { pageSetup: { paperSize: 9, orientation: report.orientation ?? 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const tables = report.blocks.filter((b) => b.type === 'table');
  const cols = Math.max(4, ...tables.map((t) => t.columns.length));
  const widest = tables.reduce((best, t) => (t.columns.length > best.columns.length ? t : best), tables[0] ?? { columns: [] });
  ws.columns = Array.from({ length: cols }, (_, i) => ({ width: Math.max(6, Math.round((widest.columns[i]?.width ?? 1) * 9)) }));

  const half = Math.max(2, Math.floor(cols / 2));
  let r = 1;
  const put = (row: number, from: number, to: number, value: string, opts: { bold?: boolean; italic?: boolean; size?: number; align?: 'left' | 'center' | 'right'; underline?: boolean } = {}) => {
    if (to > from) ws.mergeCells(row, from, row, to);
    const c = ws.getCell(row, from);
    c.value = value;
    c.font = { name: FONT, size: opts.size ?? 11, bold: opts.bold, italic: opts.italic, underline: opts.underline };
    c.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle', wrapText: true };
  };

  if (letterhead.governingBody) put(r, 1, half, letterhead.governingBody.toUpperCase());
  put(r, half + 1, cols, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true });
  r++;
  put(r, 1, half, letterhead.schoolName.toUpperCase(), { bold: true, underline: true });
  put(r, half + 1, cols, 'Độc lập - Tự do - Hạnh phúc', { bold: true, underline: true });
  r += 2;
  put(r++, 1, cols, report.title.toUpperCase(), { bold: true, size: 14 });
  for (const s of report.subtitles ?? []) put(r++, 1, cols, s, { italic: true });
  r++;

  for (const block of report.blocks) {
    if (block.type === 'text') {
      for (const line of block.lines) put(r++, 1, cols, line, { bold: block.bold, italic: block.italic, align: 'left' });
      r++;
      continue;
    }
    if (block.type === 'fields') {
      for (let i = 0; i < block.fields.length; i += 2) {
        const pair = (j: number) => (block.fields[i + j] ? `${block.fields[i + j][0]}: ${cellText(block.fields[i + j][1])}` : '');
        put(r, 1, half, pair(0), { align: 'left' });
        put(r, half + 1, cols, pair(1), { align: 'left' });
        r++;
      }
      r++;
      continue;
    }
    if (block.caption) put(r++, 1, cols, block.caption, { bold: true, align: 'left' });
    const layout = headerLayout(block.columns);
    const head = (row: number, col: number, rowSpan: number, span: number, label: string) => {
      if (rowSpan > 1 || span > 1) ws.mergeCells(row, col, row + rowSpan - 1, col + span - 1);
      const c = ws.getCell(row, col);
      c.value = label;
      c.font = { name: FONT, size: 11, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF3' } };
      for (let i = 0; i < rowSpan; i++) for (let j = 0; j < span; j++) ws.getCell(row + i, col + j).border = border;
    };
    for (const c of layout.top) head(r, c.start + 1, c.rowSpan, c.span, c.label);
    for (const c of layout.second) head(r + 1, c.start + 1, 1, 1, c.label);
    r += layout.rows;
    for (const row of block.rows) {
      block.columns.forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        const v: Cell = row[i];
        c.value = v === null || v === undefined ? null : v;
        c.font = { name: FONT, size: 11 };
        c.alignment = { horizontal: col.align ?? (typeof v === 'number' ? 'center' : 'left'), vertical: 'middle', wrapText: true };
        c.border = border;
      });
      r++;
    }
    r++;
  }

  if (report.signature !== false) {
    put(r++, half + 1, cols, dateLine(letterhead.place, letterhead.date), { italic: true });
    put(r++, half + 1, cols, (letterhead.signerTitle ?? 'Hiệu trưởng').toUpperCase(), { bold: true });
    put(r++, half + 1, cols, '(Ký, ghi rõ họ tên và đóng dấu)', { italic: true, size: 10 });
    r += 3;
    if (letterhead.signerName) put(r, half + 1, cols, letterhead.signerName, { bold: true });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Rows of the first worksheet of an uploaded .xlsx as display strings (numbers keep their value). */
export async function readXlsx(buffer: Buffer): Promise<(string | number | null)[][]> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error('Tệp không phải Excel (.xlsx) hợp lệ');
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: (string | number | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const out: (string | number | null)[] = [];
    for (let i = 1; i <= ws.columnCount; i++) {
      const v = row.getCell(i).value;
      if (v === null || v === undefined) out.push(null);
      else if (typeof v === 'number') out.push(v);
      else if (typeof v === 'object' && 'result' in v) out.push((v.result as number | string | null) ?? null);
      else if (typeof v === 'object' && 'richText' in v) out.push(v.richText.map((t) => t.text).join(''));
      else if (v instanceof Date) out.push(v.toISOString().slice(0, 10));
      else out.push(String(v));
    }
    rows[n - 1] = out;
  });
  return Array.from(rows, (r) => r ?? []);
}

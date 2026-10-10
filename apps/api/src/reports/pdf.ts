import { join } from 'path';
import type PDFKitDocument from 'pdfkit';
import { cellText, dateLine, FieldsBlock, headerLayout, Letterhead, ReportDocument, TableBlock, TextBlock } from './document';

// Official A4 documents in Times-style type (Liberation Serif, metric-compatible
// with Times New Roman and covering Vietnamese), laid out like MOET forms.

const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');
const FONTS = { R: 'LiberationSerif-Regular.ttf', B: 'LiberationSerif-Bold.ttf', I: 'LiberationSerif-Italic.ttf', BI: 'LiberationSerif-BoldItalic.ttf' } as const;
type Font = keyof typeof FONTS;

const MARGIN = 36;
const BODY = 10;
const PAD = 2.5;

type Doc = InstanceType<typeof PDFKitDocument>;

/** pdfkit loads with the first report rather than at startup, which keeps the API small on a 512 MB demo. */
const loadPdfKit = () => import('pdfkit').then((m) => m.default);

export async function renderPdf(report: ReportDocument, letterhead: Letterhead): Promise<Buffer> {
  const PDFDocument = await loadPdfKit();
  const doc = new PDFDocument({ size: 'A4', layout: report.orientation ?? 'portrait', margins: { top: MARGIN, bottom: MARGIN + 12, left: MARGIN + 14, right: MARGIN }, bufferPages: true, info: { Title: report.title } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, join(FONT_DIR, file));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawLetterhead(doc, letterhead);
  drawTitle(doc, report);
  for (const block of report.blocks) {
    if (block.type === 'table') drawTable(doc, block);
    else if (block.type === 'text') drawText(doc, block);
    else drawFields(doc, block);
  }
  if (report.signature !== false) drawSignature(doc, letterhead);
  numberPages(doc);
  doc.end();
  return done;
}

const left = (doc: Doc) => doc.page.margins.left;
const contentWidth = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottom = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

function font(doc: Doc, f: Font, size = BODY) {
  return doc.font(f).fontSize(size);
}

function drawLetterhead(doc: Doc, lh: Letterhead) {
  const y = doc.y;
  const w = contentWidth(doc);
  const colW = w * 0.45;
  const rightX = left(doc) + w - w * 0.55;
  let ly = y;
  if (lh.governingBody) {
    font(doc, 'R', 11).text(lh.governingBody.toUpperCase(), left(doc), ly, { width: colW, align: 'center' });
    ly = doc.y;
  }
  font(doc, 'B', 11).text(lh.schoolName.toUpperCase(), left(doc), ly, { width: colW, align: 'center' });
  underline(doc, left(doc) + colW / 2, doc.y + 1, Math.min(colW * 0.5, doc.widthOfString(lh.schoolName.toUpperCase()) * 0.6));
  const leftEnd = doc.y;
  font(doc, 'B', 11).text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', rightX, y, { width: w * 0.55, align: 'center' });
  font(doc, 'B', 12).text('Độc lập - Tự do - Hạnh phúc', rightX, doc.y, { width: w * 0.55, align: 'center' });
  underline(doc, rightX + (w * 0.55) / 2, doc.y + 1, doc.widthOfString('Độc lập - Tự do - Hạnh phúc'));
  doc.y = Math.max(leftEnd, doc.y) + 14;
  doc.x = left(doc);
}

function underline(doc: Doc, centerX: number, y: number, width: number) {
  doc.save().lineWidth(0.6).moveTo(centerX - width / 2, y).lineTo(centerX + width / 2, y).stroke().restore();
}

function drawTitle(doc: Doc, report: ReportDocument) {
  font(doc, 'B', 14).text(report.title.toUpperCase(), left(doc), doc.y, { width: contentWidth(doc), align: 'center' });
  for (const s of report.subtitles ?? []) font(doc, 'I', 11).text(s, left(doc), doc.y + 1, { width: contentWidth(doc), align: 'center' });
  doc.y += 10;
}

function drawText(doc: Doc, block: TextBlock) {
  const f: Font = block.bold && block.italic ? 'BI' : block.bold ? 'B' : block.italic ? 'I' : 'R';
  for (const line of block.lines) {
    ensureSpace(doc, 16);
    font(doc, f, 11).text(line, left(doc), doc.y, { width: contentWidth(doc) });
  }
  doc.y += 6;
}

function drawFields(doc: Doc, block: FieldsBlock) {
  const half = contentWidth(doc) / 2;
  for (let i = 0; i < block.fields.length; i += 2) {
    ensureSpace(doc, 16);
    const y = doc.y;
    let maxY = y;
    for (let j = 0; j < 2 && i + j < block.fields.length; j++) {
      const [label, value] = block.fields[i + j];
      const x = left(doc) + j * half;
      font(doc, 'R', 11).text(`${label}: `, x, y, { width: half - 8, continued: true }).font('B').text(cellText(value));
      maxY = Math.max(maxY, doc.y);
    }
    doc.y = maxY + 1;
  }
  doc.y += 6;
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > bottom(doc)) doc.addPage();
}

function drawTable(doc: Doc, block: TableBlock) {
  const total = contentWidth(doc);
  const weights = block.columns.map((c) => c.width ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sum) * total);
  const xs = widths.reduce<number[]>((acc, w, i) => [...acc, i === 0 ? left(doc) : acc[i - 1] + widths[i - 1]], []);
  const layout = headerLayout(block.columns);
  const size = block.columns.length > 14 ? 8 : block.columns.length > 9 ? 9 : BODY;

  if (block.caption) {
    ensureSpace(doc, 40);
    font(doc, 'B', 11).text(block.caption, left(doc), doc.y, { width: total });
    doc.y += 3;
  }

  const spanWidth = (start: number, span: number) => widths.slice(start, start + span).reduce((a, b) => a + b, 0);
  const textHeight = (s: string, w: number, f: Font) => font(doc, f, size).heightOfString(s || ' ', { width: w - 2 * PAD });
  const cellBox = (x: number, y: number, w: number, h: number, s: string, f: Font, align: 'left' | 'center' | 'right', fill?: string) => {
    if (fill) doc.save().rect(x, y, w, h).fill(fill).restore();
    doc.save().lineWidth(0.5).rect(x, y, w, h).stroke().restore();
    const th = textHeight(s, w, f);
    font(doc, f, size).text(s, x + PAD, y + Math.max(PAD, (h - th) / 2), { width: w - 2 * PAD, align, lineBreak: true });
  };

  const drawHeader = () => {
    const rowH = (cells: { label: string; start: number; span: number }[]) => Math.max(14, ...cells.map((c) => textHeight(c.label, spanWidth(c.start, c.span), 'B') + 2 * PAD));
    const h1 = rowH(layout.top.filter((c) => c.rowSpan === 1));
    const h2 = layout.rows === 2 ? rowH(layout.second) : 0;
    const y = doc.y;
    for (const c of layout.top) cellBox(xs[c.start], y, spanWidth(c.start, c.span), c.rowSpan === 2 ? h1 + h2 : h1, c.label, 'B', 'center', '#e8eef3');
    for (const c of layout.second) cellBox(xs[c.start], y + h1, widths[c.start], h2, c.label, 'B', 'center', '#e8eef3');
    doc.y = y + h1 + h2;
  };

  ensureSpace(doc, 60);
  drawHeader();
  const rows = block.rows.length ? block.rows : [[ 'Không có dữ liệu', ...block.columns.slice(1).map(() => '') ]];
  for (const row of rows) {
    const cells = block.columns.map((_, i) => cellText(row[i]));
    const h = Math.max(14, ...cells.map((s, i) => textHeight(s, widths[i], 'R') + 2 * PAD));
    if (doc.y + h > bottom(doc)) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    cells.forEach((s, i) => cellBox(xs[i], y, widths[i], h, s, 'R', block.columns[i].align ?? (typeof row[i] === 'number' ? 'center' : 'left')));
    doc.y = y + h;
  }
  doc.x = left(doc);
  doc.y += 10;
}

function drawSignature(doc: Doc, lh: Letterhead) {
  ensureSpace(doc, 110);
  const w = contentWidth(doc) * 0.45;
  const x = left(doc) + contentWidth(doc) - w;
  font(doc, 'I', 11).text(dateLine(lh.place, lh.date), x, doc.y + 4, { width: w, align: 'center' });
  font(doc, 'B', 11).text((lh.signerTitle ?? 'Hiệu trưởng').toUpperCase(), x, doc.y + 2, { width: w, align: 'center' });
  font(doc, 'I', 10).text('(Ký, ghi rõ họ tên và đóng dấu)', x, doc.y, { width: w, align: 'center' });
  if (lh.signerName) font(doc, 'B', 11).text(lh.signerName, x, doc.y + 50, { width: w, align: 'center' });
}

function numberPages(doc: Doc) {
  const range = doc.bufferedPageRange();
  if (range.count < 2) return;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    font(doc, 'I', 9).text(`Trang ${i + 1}/${range.count}`, left(doc), doc.page.height - MARGIN, { width: contentWidth(doc), align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
}

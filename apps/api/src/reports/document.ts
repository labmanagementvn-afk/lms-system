// A report as data: letterhead, title, blocks of text and tables, and the
// signature line. Renderers in pdf.ts and xlsx.ts turn it into an official
// A4 document (MOET style) or a spreadsheet; the web portal previews it as JSON.

export type Cell = string | number | null | undefined;

export interface ReportColumn {
  header: string;
  /** Relative width; defaults to 1. */
  width?: number;
  align?: 'left' | 'center' | 'right';
  /** Consecutive columns with the same group share a merged header cell above theirs. */
  group?: string;
}

export interface TableBlock {
  type: 'table';
  caption?: string;
  columns: ReportColumn[];
  rows: Cell[][];
}

export interface TextBlock {
  type: 'text';
  lines: string[];
  bold?: boolean;
  italic?: boolean;
}

/** Label/value pairs printed two per line (student details on a transcript). */
export interface FieldsBlock {
  type: 'fields';
  fields: [string, Cell][];
}

export type ReportBlock = TableBlock | TextBlock | FieldsBlock;

export interface ReportDocument {
  /** File name without extension, ASCII. */
  fileName: string;
  title: string;
  subtitles?: string[];
  orientation?: 'portrait' | 'landscape';
  blocks: ReportBlock[];
  /** Defaults to true. */
  signature?: boolean;
}

/** Who issues the document: the header on the left and the signer at the bottom right. */
export interface Letterhead {
  governingBody?: string | null;
  schoolName: string;
  place?: string | null;
  signerTitle?: string | null;
  signerName?: string | null;
  date: Date;
}

export const table = (columns: ReportColumn[], rows: Cell[][], caption?: string): TableBlock => ({ type: 'table', columns, rows, caption });
export const text = (lines: string[], style: { bold?: boolean; italic?: boolean } = {}): TextBlock => ({ type: 'text', lines, ...style });

/** Printed text of a cell; numbers use the Vietnamese decimal comma. */
export const cellText = (v: Cell): string => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v);

/**
 * "Đồng Nai, ngày 05 tháng 02 năm 2026" (the date line above the signature).
 * Per Nghị định 30/2020, days below 10 and the months 1 and 2 take a leading zero.
 */
export function dateLine(place: string | null | undefined, date: Date, timeZone = 'Asia/Ho_Chi_Minh'): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const day = String(get('day')).padStart(2, '0');
  const month = get('month') <= 2 ? String(get('month')).padStart(2, '0') : String(get('month'));
  const when = `ngày ${day} tháng ${month} năm ${get('year')}`;
  return place ? `${place}, ${when}` : when.charAt(0).toUpperCase() + when.slice(1);
}

/** Header cells of a table: one row, or two when some columns are grouped. */
export function headerLayout(columns: ReportColumn[]) {
  const grouped = columns.some((c) => c.group);
  const top: { label: string; start: number; span: number; rowSpan: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    const g = columns[i].group;
    if (g && top.length && top[top.length - 1].label === g && top[top.length - 1].rowSpan === 1 && top[top.length - 1].start + top[top.length - 1].span === i) {
      top[top.length - 1].span++;
    } else if (g) {
      top.push({ label: g, start: i, span: 1, rowSpan: 1 });
    } else {
      top.push({ label: columns[i].header, start: i, span: 1, rowSpan: grouped ? 2 : 1 });
    }
  }
  const second = grouped ? columns.map((c, i) => ({ label: c.header, start: i, span: 1, rowSpan: 1, show: !!c.group })).filter((c) => c.show) : [];
  return { rows: grouped ? 2 : 1, top, second };
}

/** ASCII file name from Vietnamese text: "Bảng điểm 9/11" -> "bang-diem-9-11". */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

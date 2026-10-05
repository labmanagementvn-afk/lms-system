// Minimal CSV codec (RFC 4180 flavour) for the admissions import/export; no dependencies.

export const CSV_BOM = '﻿';

export type CsvCell = string | number | boolean | null | undefined;

/**
 * Picks the delimiter used by the first line: Excel on Vietnamese locales
 * writes semicolons, everything else writes commas.
 */
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

/**
 * Parses CSV text into rows of fields. Handles an optional BOM, CRLF/LF/CR line
 * endings, quoted fields with doubled quotes and comma or semicolon delimiters.
 * Rows whose every field is empty are dropped.
 */
export function parseCsv(text: string, delimiter?: ',' | ';'): string[][] {
  const src = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endRow = () => {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
    row = [];
    field = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

/** Quotes a field when it holds the delimiter, a quote or a line break. */
export function escapeCsvField(value: CsvCell, delimiter = ','): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serializes rows with CRLF line endings; `bom` prefixes the UTF-8 BOM so Excel reads Vietnamese text. */
export function serializeCsv(rows: CsvCell[][], options: { delimiter?: ',' | ';'; bom?: boolean } = {}): string {
  const delim = options.delimiter ?? ',';
  const body = rows.map((r) => r.map((c) => escapeCsvField(c, delim)).join(delim)).join('\r\n');
  return (options.bom ? CSV_BOM : '') + body + (rows.length ? '\r\n' : '');
}

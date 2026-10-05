import { CSV_BOM, detectDelimiter, escapeCsvField, parseCsv, serializeCsv } from './csv';

describe('parseCsv', () => {
  it('splits comma-separated rows and strips the BOM', () => {
    expect(parseCsv(`${CSV_BOM}a,b,c\n1,2,3\n`)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('auto-detects semicolons (Excel vi-VN)', () => {
    expect(detectDelimiter('Họ tên;Ngày sinh\n')).toBe(';');
    expect(parseCsv('Họ tên;Ngày sinh\r\nNguyễn An;01/09/2015\r\n')).toEqual([
      ['Họ tên', 'Ngày sinh'],
      ['Nguyễn An', '01/09/2015'],
    ]);
  });

  it('handles quoted fields with delimiters, doubled quotes and line breaks', () => {
    const rows = parseCsv('name,note\n"Lê, Bình","Nói ""xin chào""\nhai dòng"\n');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Lê, Bình', 'Nói "xin chào"\nhai dòng'],
    ]);
  });

  it('ignores a delimiter inside quotes when detecting', () => {
    expect(detectDelimiter('"a;b;c",d\n')).toBe(',');
  });

  it('drops blank rows and keeps empty fields', () => {
    expect(parseCsv('a,b\n\n,\n1,\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('accepts CR line endings and a missing trailing newline', () => {
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(CSV_BOM)).toEqual([]);
  });
});

describe('serializeCsv', () => {
  it('escapes only what needs escaping', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('x;y', ';')).toBe('"x;y"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(12)).toBe('12');
  });

  it('writes CRLF rows with an optional BOM', () => {
    expect(serializeCsv([['a', 'b'], ['1', null]])).toBe('a,b\r\n1,\r\n');
    expect(serializeCsv([['x']], { bom: true })).toBe(`${CSV_BOM}x\r\n`);
    expect(serializeCsv([])).toBe('');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['Họ tên', 'Ghi chú'],
      ['Trần "Bé" Na', 'dòng 1\ndòng 2, có phẩy'],
    ];
    expect(parseCsv(serializeCsv(rows, { bom: true }))).toEqual(rows);
  });
});

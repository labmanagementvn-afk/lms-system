import { Gender, StudentStatus } from '@prisma/client';
import { parseCsv } from '../admissions/csv';
import { buildCsv, dmy, mapHeaders, MOET_COLUMNS, normalizeHeader, parseDate, parseGender, parseStudentImport, studentImportTemplate, studentRow, termResultRow } from './moet-csv';

describe('MOET CSV mapping', () => {
  it('formats dates and enum labels for the template', () => {
    expect(dmy('2014-10-05')).toBe('05/10/2014');
    expect(dmy(new Date('2014-10-05T00:00:00Z'))).toBe('05/10/2014');
    expect(dmy(null)).toBe('');
    const row = studentRow({
      moetCode: '01-0123',
      code: 'HS2026001',
      fullName: 'Nguyễn An',
      dateOfBirth: new Date('2014-10-05T00:00:00Z'),
      gender: Gender.FEMALE,
      gradeLevel: 6,
      className: '6A1',
      status: StudentStatus.STUDYING,
      address: null,
      guardian: { fullName: 'Nguyễn Bình', relationship: 'FATHER', phone: '0912' },
      idNumber: '001214012345',
      ethnicity: 'Kinh',
      birthPlace: null,
      hometown: 'Nam Định',
    });
    expect(row).toEqual(['01-0123', 'HS2026001', 'Nguyễn An', '05/10/2014', 'Nữ', 6, '6A1', 'Đang học', '', 'Nguyễn Bình', 'Bố', '0912', '001214012345', 'Kinh', '', 'Nam Định']);
    expect(row).toHaveLength(MOET_COLUMNS.STUDENTS.length);
  });

  it('appends subject averages with a decimal comma', () => {
    const row = termResultRow(
      { moetCode: 'x', academicYear: '2026-2027', semester: 1, className: '6A1', code: 'HS1', fullName: 'A', academic: 'TOT', conduct: 'KHA', title: 'Học sinh giỏi', promotion: null, absentDays: 2, averages: { TOAN: 8.5, VAN: null } },
      ['TOAN', 'VAN'],
    );
    expect(row.slice(-2)).toEqual(['8,5', '']);
    expect(row[2]).toBe('HK1');
    expect(row[6]).toBe('Tốt');
  });

  it('writes a BOM and semicolons', () => {
    const csv = buildCsv(['a', 'b'], [['x;y', 1]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('a;b\r\n"x;y";1\r\n');
  });

  it('matches headers by meaning', () => {
    expect(normalizeHeader('Họ và tên')).toBe('ho va ten');
    expect(normalizeHeader('ĐIỆN THOẠI người giám hộ ')).toBe('dien thoai nguoi giam ho');
    const idx = mapHeaders(['Lớp', 'Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'phone']);
    expect(idx).toEqual({ className: 0, code: 1, fullName: 2, dateOfBirth: 3, gender: 4, guardianPhone: 5 });
  });

  it('parses dates and genders in both conventions', () => {
    expect(parseDate('05/10/2014')).toBe('2014-10-05');
    expect(parseDate('2014-10-05')).toBe('2014-10-05');
    expect(parseDate('5.10.2014')).toBe('2014-10-05');
    expect(parseDate('')).toBeNull();
    expect(parseDate('31/02/2014')).toBeUndefined();
    expect(parseDate('yesterday')).toBeUndefined();
    expect(parseGender('Nữ')).toBe(Gender.FEMALE);
    expect(parseGender('nam')).toBe(Gender.MALE);
    expect(parseGender('')).toBeNull();
    expect(parseGender('?')).toBeUndefined();
  });

  it('parses the template and reports bad lines', () => {
    const text = studentImportTemplate('01-0123') + 'x;HS2;Trần B;;;;;;;;;\r\nx;HS3;Lê C;32/13/2000;Nam;;;;;;;\r\nx;HS2;Trùng;;;;;;;;;\r\nx;;Thiếu mã;;;;;;;;;\r\nx;HS4;Phạm D;;;;;;;;;;12345;;;\r\n';
    const { rows, errors } = parseStudentImport(text);
    expect(rows.map((r) => r.code)).toEqual(['HS2026031', 'HS2']);
    expect(rows[0]).toMatchObject({ dateOfBirth: '2015-03-15', gender: 'MALE', className: '6A1', status: 'STUDYING', guardian: { fullName: 'Nguyễn Văn Bình', relationship: 'FATHER', phone: '0912345678' } });
    expect(rows[0]).toMatchObject({ idNumber: '001215012345', ethnicity: 'Kinh', birthPlace: 'Hà Nội', hometown: 'Nam Định' });
    expect(rows[1]).toMatchObject({ dateOfBirth: null, gender: null, className: null, status: null, guardian: null, idNumber: null, ethnicity: null });
    expect(errors).toEqual([
      { line: 4, message: expect.stringContaining('Ngày sinh') },
      { line: 5, message: expect.stringContaining('bị lặp') },
      { line: 6, message: expect.stringContaining('Thiếu mã') },
      { line: 7, message: expect.stringContaining('Mã định danh') },
    ]);
  });

  it('rejects a file without the key columns', () => {
    expect(parseStudentImport('a,b\n1,2').errors[0].message).toContain('Thiếu cột');
    expect(parseStudentImport('').errors[0].message).toBe('Tệp trống');
    expect(parseCsv(studentImportTemplate('x'))[0]).toEqual(MOET_COLUMNS.STUDENTS);
  });
});

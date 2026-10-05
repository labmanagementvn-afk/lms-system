import { canonical, mapHeaders, mapRow, parseDate, parseGender, parsePhone, parseRelationship } from './import-mapping';

describe('canonical', () => {
  it('drops diacritics, case and punctuation', () => {
    expect(canonical(' Họ và Tên ')).toBe('hovaten');
    expect(canonical('Full_Name')).toBe('fullname');
    expect(canonical('SĐT*')).toBe('sdt');
    expect(canonical('Địa chỉ')).toBe('diachi');
  });
});

describe('mapHeaders', () => {
  it('accepts the English template', () => {
    const { columns, missing } = mapHeaders('fullName,gender,dateOfBirth,address,previousSchool,guardianName,guardianPhone,guardianEmail,guardianRelationship,notes'.split(','));
    expect(columns).toEqual({ fullName: 0, gender: 1, dateOfBirth: 2, address: 3, previousSchool: 4, guardianName: 5, guardianPhone: 6, guardianEmail: 7, guardianRelationship: 8, notes: 9 });
    expect(missing).toEqual([]);
  });

  it('accepts the Vietnamese template in any order and ignores unknown columns', () => {
    const { columns, missing } = mapHeaders(['STT', 'Ngày sinh', 'Họ tên', 'SĐT', 'Người giám hộ', 'Giới tính', 'Email', 'Quan hệ', 'Trường cũ', 'Địa chỉ', 'Ghi chú']);
    expect(columns).toMatchObject({ dateOfBirth: 1, fullName: 2, guardianPhone: 3, guardianName: 4, gender: 5, guardianEmail: 6, guardianRelationship: 7, previousSchool: 8, address: 9, notes: 10 });
    expect(missing).toEqual([]);
  });

  it('reports missing required columns', () => {
    expect(mapHeaders(['Họ tên', 'Ghi chú']).missing).toEqual(['dateOfBirth', 'guardianName', 'guardianPhone']);
  });
});

describe('parseDate', () => {
  it('reads dd/mm/yyyy and yyyy-mm-dd', () => {
    expect(parseDate('05/09/2015')).toBe('2015-09-05');
    expect(parseDate('5-9-2015')).toBe('2015-09-05');
    expect(parseDate('2015-09-05')).toBe('2015-09-05');
    expect(parseDate('2015/9/5')).toBe('2015-09-05');
    expect(parseDate('2015-09-05T00:00:00.000Z')).toBe('2015-09-05');
  });

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2015')).toBeNull();
    expect(parseDate('29/02/2016')).toBe('2016-02-29');
    expect(parseDate('29/02/2015')).toBeNull();
    expect(parseDate('13/13/2015')).toBeNull();
    expect(parseDate('abc')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('parseGender / parseRelationship / parsePhone', () => {
  it('maps Vietnamese and English genders', () => {
    expect(parseGender('Nam')).toBe('MALE');
    expect(parseGender('nữ')).toBe('FEMALE');
    expect(parseGender('Nu')).toBe('FEMALE');
    expect(parseGender('FEMALE')).toBe('FEMALE');
    expect(parseGender('male')).toBe('MALE');
    expect(parseGender('')).toBeUndefined();
    expect(parseGender('xyz')).toBeNull();
  });

  it('maps relationships with sensible defaults', () => {
    expect(parseRelationship('Cha')).toBe('FATHER');
    expect(parseRelationship('Bố')).toBe('FATHER');
    expect(parseRelationship('Mẹ')).toBe('MOTHER');
    expect(parseRelationship('MOTHER')).toBe('MOTHER');
    expect(parseRelationship('Người giám hộ')).toBe('GUARDIAN');
    expect(parseRelationship('')).toBe('GUARDIAN');
    expect(parseRelationship('Cô ruột')).toBe('OTHER');
  });

  it('normalises phones, restoring the zero Excel strips', () => {
    expect(parsePhone('0903 123 456')).toBe('0903123456');
    expect(parsePhone('+84 903 123 456')).toBe('0903123456');
    expect(parsePhone('903123456')).toBe('0903123456');
    expect(parsePhone('12')).toBeNull();
  });
});

describe('mapRow', () => {
  const { columns } = mapHeaders(['Họ tên', 'Giới tính', 'Ngày sinh', 'Người giám hộ', 'SĐT', 'Email', 'Quan hệ']);

  it('builds application data', () => {
    const r = mapRow(columns, ['  Nguyễn   Văn An ', 'Nam', '01/09/2015', 'Nguyễn Văn Bình', '0903 111 222', '', 'Cha']);
    expect(r.errors).toEqual([]);
    expect(r.data).toEqual({
      fullName: 'Nguyễn Văn An',
      gender: 'MALE',
      dateOfBirth: '2015-09-01',
      address: undefined,
      previousSchool: undefined,
      guardianName: 'Nguyễn Văn Bình',
      guardianPhone: '0903111222',
      guardianEmail: undefined,
      guardianRelationship: 'FATHER',
      notes: undefined,
    });
  });

  it('collects every problem of a row', () => {
    const r = mapRow(columns, ['', 'abc', '31/02/2015', '', '12', 'not-an-email', '']);
    expect(r.data).toBeUndefined();
    expect(r.errors).toEqual([
      'Thiếu họ tên',
      'Ngày sinh không hợp lệ (dd/mm/yyyy)',
      'Giới tính không hợp lệ (Nam/Nữ)',
      'Thiếu họ tên người giám hộ',
      'Số điện thoại không hợp lệ',
      'Email không hợp lệ',
    ]);
  });

  it('tolerates short rows', () => {
    const r = mapRow(columns, ['Lê Na']);
    expect(r.errors).toEqual(['Thiếu ngày sinh', 'Thiếu họ tên người giám hộ', 'Thiếu số điện thoại']);
  });
});

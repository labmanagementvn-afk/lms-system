// Pure helpers for the application CSV import: header aliases (English and
// Vietnamese), date/gender/relationship parsing and the Vietnamese labels used
// by the export.
import { ApplicationSource, ApplicationStatus, Gender, GuardianRelationship } from '@prisma/client';
import { normalizePhone } from '../common/phone';

export type ImportField =
  | 'fullName'
  | 'gender'
  | 'dateOfBirth'
  | 'address'
  | 'previousSchool'
  | 'guardianName'
  | 'guardianPhone'
  | 'guardianEmail'
  | 'guardianRelationship'
  | 'notes';

export const REQUIRED_FIELDS: ImportField[] = ['fullName', 'dateOfBirth', 'guardianName', 'guardianPhone'];

/** Column headers of the import template and the export, in order. */
export const FIELD_LABELS: Record<ImportField, string> = {
  fullName: 'Họ tên',
  gender: 'Giới tính',
  dateOfBirth: 'Ngày sinh',
  address: 'Địa chỉ',
  previousSchool: 'Trường cũ',
  guardianName: 'Người giám hộ',
  guardianPhone: 'SĐT',
  guardianEmail: 'Email',
  guardianRelationship: 'Quan hệ',
  notes: 'Ghi chú',
};

export const GENDER_LABELS: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = { FATHER: 'Cha', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ', OTHER: 'Khác' };
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'Mới nộp',
  SCREENING: 'Đang xét',
  ACCEPTED: 'Trúng tuyển',
  REJECTED: 'Không đạt',
  ENROLLED: 'Đã nhập học',
  WITHDRAWN: 'Rút hồ sơ',
};
export const SOURCE_LABELS: Record<ApplicationSource, string> = { ONLINE: 'Trực tuyến', IMPORT: 'Nhập từ file', MANUAL: 'Nhập tay' };

/** "Họ và Tên " -> "hovaten": lower-case, no diacritics, letters and digits only. */
export function canonical(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Canonical forms of the accepted headers (English field names and Vietnamese labels, with common variants).
const HEADER_ALIASES: Record<ImportField, string[]> = {
  fullName: ['fullname', 'name', 'studentname', 'hoten', 'hovaten', 'ten', 'hotenhocsinh', 'hocsinh'],
  gender: ['gender', 'sex', 'gioitinh'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birthday', 'ngaysinh', 'ngaythangnamsinh'],
  address: ['address', 'diachi', 'noio'],
  previousSchool: ['previousschool', 'school', 'truongcu', 'truongdanghoc', 'truong'],
  guardianName: ['guardianname', 'guardian', 'parent', 'parentname', 'nguoigiamho', 'phuhuynh', 'hotenphuhuynh', 'tenphuhuynh', 'chame'],
  guardianPhone: ['guardianphone', 'phone', 'mobile', 'tel', 'parentphone', 'sdt', 'sodienthoai', 'dienthoai', 'sdtphuhuynh'],
  guardianEmail: ['guardianemail', 'email', 'parentemail', 'thudientu'],
  guardianRelationship: ['guardianrelationship', 'relationship', 'relation', 'quanhe', 'moiquanhe'],
  notes: ['notes', 'note', 'ghichu'],
};

export interface HeaderMap {
  /** Field -> column index. */
  columns: Partial<Record<ImportField, number>>;
  /** Required fields with no matching column. */
  missing: ImportField[];
}

/** Maps the header row to fields; the first matching column wins. */
export function mapHeaders(headers: string[]): HeaderMap {
  const columns: Partial<Record<ImportField, number>> = {};
  headers.forEach((h, i) => {
    const key = canonical(h);
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
      if (columns[field] === undefined && aliases.includes(key)) {
        columns[field] = i;
        return;
      }
    }
  });
  return { columns, missing: REQUIRED_FIELDS.filter((f) => columns[f] === undefined) };
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "dd/mm/yyyy", "d-m-yyyy", "yyyy-mm-dd" or "yyyy/mm/dd" -> "yyyy-mm-dd"; null when invalid. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (match) [d, m, y] = [+match[1], +match[2], +match[3]];
  else if ((match = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T ].*)?$/.exec(s))) [y, m, d] = [+match[1], +match[2], +match[3]];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Nam/Nữ/Nam giới/MALE/FEMALE/M/F/Khác -> Gender; undefined when blank, null when unrecognised. */
export function parseGender(input: string): Gender | null | undefined {
  const key = canonical(input);
  if (!key) return undefined;
  if (['nam', 'male', 'm', 'namgioi', 'trai'].includes(key)) return Gender.MALE;
  if (['nu', 'female', 'f', 'nugioi', 'gai'].includes(key)) return Gender.FEMALE;
  if (['khac', 'other', 'o'].includes(key)) return Gender.OTHER;
  return null;
}

/** Cha/Bố/Mẹ/Người giám hộ/FATHER/... -> relationship; blank defaults to GUARDIAN, unknown to OTHER. */
export function parseRelationship(input: string): GuardianRelationship {
  const key = canonical(input);
  if (!key) return GuardianRelationship.GUARDIAN;
  if (['cha', 'bo', 'ba', 'father', 'dad', 'bome', 'chame'].includes(key)) return GuardianRelationship.FATHER;
  if (['me', 'ma', 'mother', 'mom', 'mum'].includes(key)) return GuardianRelationship.MOTHER;
  if (['nguoigiamho', 'giamho', 'guardian', 'ongba', 'ong', 'ba'].includes(key)) return GuardianRelationship.GUARDIAN;
  return GuardianRelationship.OTHER;
}

/** Like normalizePhone, but also forgives the leading zero Excel strips from "0903 123 456". */
export function parsePhone(input: string): string | null {
  const direct = normalizePhone(input);
  if (direct) return direct;
  const digits = input.replace(/\D/g, '');
  return digits.length === 9 ? normalizePhone('0' + digits) : null;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');

export interface ImportedApplication {
  fullName: string;
  gender?: Gender;
  dateOfBirth: string;
  address?: string;
  previousSchool?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianRelationship: GuardianRelationship;
  notes?: string;
}

/** Turns one CSV row into application data, collecting every problem of the row. */
export function mapRow(columns: HeaderMap['columns'], row: string[]): { data?: ImportedApplication; errors: string[] } {
  const cell = (f: ImportField) => (columns[f] === undefined ? '' : (row[columns[f]!] ?? '').trim());
  const errors: string[] = [];

  const fullName = cleanName(cell('fullName'));
  if (!fullName) errors.push('Thiếu họ tên');
  const dob = parseDate(cell('dateOfBirth'));
  if (!dob) errors.push(cell('dateOfBirth') ? 'Ngày sinh không hợp lệ (dd/mm/yyyy)' : 'Thiếu ngày sinh');
  const gender = parseGender(cell('gender'));
  if (gender === null) errors.push('Giới tính không hợp lệ (Nam/Nữ)');
  const guardianName = cleanName(cell('guardianName'));
  if (!guardianName) errors.push('Thiếu họ tên người giám hộ');
  const guardianPhone = parsePhone(cell('guardianPhone'));
  if (!guardianPhone) errors.push(cell('guardianPhone') ? 'Số điện thoại không hợp lệ' : 'Thiếu số điện thoại');
  const email = cell('guardianEmail');
  if (email && !EMAIL.test(email)) errors.push('Email không hợp lệ');

  if (errors.length) return { errors };
  const opt = (s: string) => (s ? s : undefined);
  return {
    errors,
    data: {
      fullName,
      gender: gender ?? undefined,
      dateOfBirth: dob!,
      address: opt(cell('address')),
      previousSchool: opt(cell('previousSchool')),
      guardianName,
      guardianPhone: guardianPhone!,
      guardianEmail: opt(email),
      guardianRelationship: parseRelationship(cell('guardianRelationship')),
      notes: opt(cell('notes')),
    },
  };
}

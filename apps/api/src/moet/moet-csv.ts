// Column mapping between this system and the MOET education database (CSDL ngành GDĐT)
// exchange files. Pure functions: the service feeds them rows and gets CSV back.
import { Gender, MoetExportKind, PromotionStatus, ResultLevel, StudentStatus, TeacherStatus } from '@prisma/client';
import { CsvCell, parseCsv, serializeCsv } from '../admissions/csv';

/** Column headers of each export, in the order CSDL ngành import templates list them. */
export const MOET_COLUMNS: Record<MoetExportKind, string[]> = {
  STUDENTS: ['Mã trường', 'Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'Khối', 'Lớp', 'Trạng thái', 'Địa chỉ', 'Họ tên người giám hộ', 'Quan hệ', 'Điện thoại người giám hộ', 'Mã định danh', 'Dân tộc', 'Nơi sinh', 'Quê quán'],
  TEACHERS: ['Mã trường', 'Mã giáo viên', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'Điện thoại', 'Email', 'Trạng thái', 'Môn giảng dạy'],
  CLASSES: ['Mã trường', 'Năm học', 'Khối', 'Lớp', 'Phòng học', 'Mã GVCN', 'Giáo viên chủ nhiệm', 'Sĩ số'],
  TERM_RESULTS: ['Mã trường', 'Năm học', 'Học kỳ', 'Lớp', 'Mã học sinh', 'Họ và tên', 'Kết quả học tập', 'Kết quả rèn luyện', 'Danh hiệu', 'Lên lớp', 'Số ngày nghỉ'],
};

export const GENDER_VI: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
export const STUDENT_STATUS_VI: Record<StudentStatus, string> = { STUDYING: 'Đang học', TRANSFERRED: 'Chuyển trường', DROPPED: 'Thôi học', GRADUATED: 'Tốt nghiệp' };
export const TEACHER_STATUS_VI: Record<TeacherStatus, string> = { ACTIVE: 'Đang công tác', ON_LEAVE: 'Nghỉ phép', RESIGNED: 'Đã nghỉ việc' };
export const RESULT_LEVEL_VI: Record<ResultLevel, string> = { TOT: 'Tốt', KHA: 'Khá', DAT: 'Đạt', CHUA_DAT: 'Chưa đạt' };
export const PROMOTION_VI: Record<PromotionStatus, string> = { PROMOTED: 'Được lên lớp', RETEST: 'Kiểm tra lại', RETAINED: 'Ở lại lớp' };
export const RELATIONSHIP_VI: Record<string, string> = { FATHER: 'Bố', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ', OTHER: 'Khác' };

/** "2026-10-05" (or a Date) -> "05/10/2026", the date format of the MOET templates. */
export function dmy(d: Date | string | null | undefined): string {
  if (!d) return '';
  const s = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

export interface StudentExportRow {
  moetCode: string;
  code: string;
  fullName: string;
  dateOfBirth: Date | null;
  gender: Gender | null;
  gradeLevel: number | null;
  className: string | null;
  status: StudentStatus;
  address: string | null;
  guardian: { fullName: string; relationship: string; phone: string } | null;
  idNumber: string | null;
  ethnicity: string | null;
  birthPlace: string | null;
  hometown: string | null;
}

export function studentRow(s: StudentExportRow): CsvCell[] {
  return [
    s.moetCode,
    s.code,
    s.fullName,
    dmy(s.dateOfBirth),
    s.gender ? GENDER_VI[s.gender] : '',
    s.gradeLevel ?? '',
    s.className ?? '',
    STUDENT_STATUS_VI[s.status],
    s.address ?? '',
    s.guardian?.fullName ?? '',
    s.guardian ? (RELATIONSHIP_VI[s.guardian.relationship] ?? s.guardian.relationship) : '',
    s.guardian?.phone ?? '',
    s.idNumber ?? '',
    s.ethnicity ?? '',
    s.birthPlace ?? '',
    s.hometown ?? '',
  ];
}

export interface TeacherExportRow {
  moetCode: string;
  code: string;
  fullName: string;
  dateOfBirth: Date | null;
  gender: Gender | null;
  phone: string | null;
  email: string | null;
  status: TeacherStatus;
  subjects: string[];
}

export function teacherRow(t: TeacherExportRow): CsvCell[] {
  return [t.moetCode, t.code, t.fullName, dmy(t.dateOfBirth), t.gender ? GENDER_VI[t.gender] : '', t.phone ?? '', t.email ?? '', TEACHER_STATUS_VI[t.status], t.subjects.join('; ')];
}

export interface ClassExportRow {
  moetCode: string;
  academicYear: string;
  gradeLevel: number;
  name: string;
  room: string | null;
  homeroomCode: string | null;
  homeroomName: string | null;
  size: number;
}

export function classRow(c: ClassExportRow): CsvCell[] {
  return [c.moetCode, c.academicYear, c.gradeLevel, c.name, c.room ?? '', c.homeroomCode ?? '', c.homeroomName ?? '', c.size];
}

export interface TermResultExportRow {
  moetCode: string;
  academicYear: string;
  semester: number;
  className: string;
  code: string;
  fullName: string;
  academic: ResultLevel | null;
  conduct: ResultLevel | null;
  title: string | null;
  promotion: PromotionStatus | null;
  absentDays: number;
  /** Subject code -> average, appended as extra columns in `subjectCodes` order. */
  averages: Record<string, number | null>;
}

export function termResultRow(r: TermResultExportRow, subjectCodes: string[]): CsvCell[] {
  return [
    r.moetCode,
    r.academicYear,
    r.semester === 0 ? 'Cả năm' : `HK${r.semester}`,
    r.className,
    r.code,
    r.fullName,
    r.academic ? RESULT_LEVEL_VI[r.academic] : '',
    r.conduct ? RESULT_LEVEL_VI[r.conduct] : '',
    r.title ?? '',
    r.promotion ? PROMOTION_VI[r.promotion] : '',
    r.absentDays,
    ...subjectCodes.map((c) => (r.averages[c] === null || r.averages[c] === undefined ? '' : String(r.averages[c]).replace('.', ','))),
  ];
}

/** CSV text with a BOM and semicolons, which Excel on a Vietnamese locale opens as columns. */
export function buildCsv(header: string[], rows: CsvCell[][]): string {
  return serializeCsv([header, ...rows], { bom: true, delimiter: ';' });
}

// ---- student import ----

export interface ImportedStudent {
  line: number;
  code: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  className: string | null;
  status: StudentStatus | null;
  address: string | null;
  guardian: { fullName: string; relationship: string; phone: string } | null;
  idNumber: string | null;
  ethnicity: string | null;
  birthPlace: string | null;
  hometown: string | null;
}

export interface ImportParse {
  rows: ImportedStudent[];
  errors: { line: number; message: string }[];
}

/** Lower-case, no diacritics, single spaces: "Họ và tên" -> "ho va ten". */
export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every header spelling we accept for each field (normalised form). */
const HEADER_ALIASES: Record<string, string[]> = {
  code: ['ma hoc sinh', 'ma hs', 'code', 'student code', 'ma'],
  fullName: ['ho va ten', 'ho ten', 'full name', 'fullname', 'name', 'ten'],
  dateOfBirth: ['ngay sinh', 'date of birth', 'dob', 'birthday'],
  gender: ['gioi tinh', 'gender', 'sex'],
  className: ['lop', 'ten lop', 'class', 'class name'],
  gradeLevel: ['khoi', 'khoi lop', 'grade', 'grade level'],
  status: ['trang thai', 'status'],
  address: ['dia chi', 'address'],
  guardianName: ['ho ten nguoi giam ho', 'nguoi giam ho', 'ho ten phu huynh', 'phu huynh', 'guardian', 'guardian name'],
  relationship: ['quan he', 'relationship'],
  guardianPhone: ['dien thoai nguoi giam ho', 'dien thoai phu huynh', 'so dien thoai', 'dien thoai', 'phone', 'guardian phone'],
  idNumber: ['ma dinh danh', 'ma dinh danh ca nhan', 'so dinh danh', 'so cccd', 'cccd', 'id number'],
  ethnicity: ['dan toc', 'ethnicity'],
  birthPlace: ['noi sinh', 'place of birth', 'birthplace'],
  hometown: ['que quan', 'hometown'],
};

export function mapHeaders(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (idx[field] === undefined && aliases.includes(n)) idx[field] = i;
  });
  return idx;
}

/** "05/10/2014", "5-10-2014" or "2014-10-05" -> "2014-10-05"; null when empty, undefined when unreadable. */
export function parseDate(text: string): string | null | undefined {
  const s = text.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!m) return undefined;
    [d, mo, y] = [+m[1], +m[2], +m[3]];
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

export function parseGender(text: string): Gender | null | undefined {
  if (!text.trim()) return null;
  const n = normalizeHeader(text);
  if (['nam', 'm', 'male', '1'].includes(n)) return Gender.MALE;
  if (['nu', 'f', 'female', '0', '2'].includes(n)) return Gender.FEMALE;
  if (['khac', 'other'].includes(n)) return Gender.OTHER;
  return undefined;
}

export function parseStatus(text: string): StudentStatus | null | undefined {
  if (!text.trim()) return null;
  const n = normalizeHeader(text);
  const map: Record<string, StudentStatus> = { 'dang hoc': 'STUDYING', studying: 'STUDYING', 'chuyen truong': 'TRANSFERRED', transferred: 'TRANSFERRED', 'thoi hoc': 'DROPPED', dropped: 'DROPPED', 'tot nghiep': 'GRADUATED', graduated: 'GRADUATED' };
  return map[n];
}

export function parseRelationship(text: string): string {
  const n = normalizeHeader(text);
  const map: Record<string, string> = { bo: 'FATHER', cha: 'FATHER', father: 'FATHER', me: 'MOTHER', mother: 'MOTHER', 'nguoi giam ho': 'GUARDIAN', guardian: 'GUARDIAN', khac: 'OTHER', other: 'OTHER' };
  return map[n] ?? (n ? 'OTHER' : 'GUARDIAN');
}

/**
 * Parses a student list in the MOET template (or the ASCII aliases above). The header row
 * is matched by meaning, so column order does not matter; "Mã học sinh" and "Họ và tên" are required.
 */
export function parseStudentImport(text: string): ImportParse {
  const errors: ImportParse['errors'] = [];
  const rows: ImportedStudent[] = [];
  const table = parseCsv(text);
  if (!table.length) return { rows, errors: [{ line: 1, message: 'Tệp trống' }] };
  const idx = mapHeaders(table[0]);
  if (idx.code === undefined || idx.fullName === undefined) {
    return { rows, errors: [{ line: 1, message: 'Thiếu cột "Mã học sinh" hoặc "Họ và tên" ở dòng tiêu đề' }] };
  }
  const cell = (r: string[], field: string) => (idx[field] === undefined ? '' : (r[idx[field]] ?? '').trim());
  const seen = new Set<string>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const code = cell(r, 'code');
    const fullName = cell(r, 'fullName');
    if (!code || !fullName) return void errors.push({ line, message: 'Thiếu mã học sinh hoặc họ tên' });
    if (seen.has(code)) return void errors.push({ line, message: `Mã học sinh ${code} bị lặp trong tệp` });
    seen.add(code);
    const dateOfBirth = parseDate(cell(r, 'dateOfBirth'));
    if (dateOfBirth === undefined) return void errors.push({ line, message: `Ngày sinh không hợp lệ: "${cell(r, 'dateOfBirth')}"` });
    const gender = parseGender(cell(r, 'gender'));
    if (gender === undefined) return void errors.push({ line, message: `Giới tính không hợp lệ: "${cell(r, 'gender')}"` });
    const status = parseStatus(cell(r, 'status'));
    if (status === undefined) return void errors.push({ line, message: `Trạng thái không hợp lệ: "${cell(r, 'status')}"` });
    const guardianName = cell(r, 'guardianName');
    const guardianPhone = cell(r, 'guardianPhone').replace(/[\s.]/g, '');
    if (guardianPhone && !/^0\d{9,10}$/.test(guardianPhone)) return void errors.push({ line, message: `Số điện thoại không hợp lệ: "${cell(r, 'guardianPhone')}"` });
    const idNumber = cell(r, 'idNumber').replace(/\s/g, '');
    if (idNumber && !/^\d{12}$/.test(idNumber)) return void errors.push({ line, message: `Mã định danh phải gồm 12 chữ số: "${cell(r, 'idNumber')}"` });
    rows.push({
      line,
      code,
      fullName,
      dateOfBirth,
      gender,
      className: cell(r, 'className') || null,
      status,
      address: cell(r, 'address') || null,
      guardian: guardianName && guardianPhone ? { fullName: guardianName, relationship: parseRelationship(cell(r, 'relationship')), phone: guardianPhone } : null,
      idNumber: idNumber || null,
      ethnicity: cell(r, 'ethnicity') || null,
      birthPlace: cell(r, 'birthPlace') || null,
      hometown: cell(r, 'hometown') || null,
    });
  });
  return { rows, errors };
}

/** The import template: the student header plus one example row. */
export function studentImportTemplate(moetCode: string): string {
  const header = MOET_COLUMNS.STUDENTS;
  const example: CsvCell[] = [moetCode, 'HS2026031', 'Nguyễn Văn An', '15/03/2015', 'Nam', 6, '6A1', 'Đang học', 'Hà Nội', 'Nguyễn Văn Bình', 'Bố', '0912345678', '001215012345', 'Kinh', 'Hà Nội', 'Nam Định'];
  return buildCsv(header, [example]);
}

// The education database's submission service (CSDL ngành of the ministry, or the Sở's own),
// behind an adapter. Only a sandbox exists: real endpoints need the authority's API access.
import { Logger } from '@nestjs/common';
import { MoetExportKind, MoetTarget } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CsvCell } from '../admissions/csv';

export const MOET_GATEWAY = Symbol('MOET_GATEWAY');

/** One kind of records, as the exchange template lays them out. */
export interface MoetBatch {
  target: MoetTarget;
  kind: MoetExportKind;
  /** The school's code in the education database. */
  schoolCode: string;
  academicYear: string | null;
  semester: number | null;
  header: string[];
  rows: CsvCell[][];
}

/** The school's account on the database; used for this submission only, never stored. */
export interface MoetCredentials {
  username: string;
  password: string;
}

/** A record the database refused: its data row (1-based), code, name and why. */
export interface MoetRowError {
  row: number;
  code: string;
  name: string;
  message: string;
}

export interface MoetSubmitResult {
  /** The batch number the database gives back. */
  batchId: string;
  accepted: number;
  rejected: MoetRowError[];
}

export interface MoetGateway {
  readonly name: string;
  /** Signs in and submits one batch. Throws when the sign-in or the whole batch is refused. */
  submit(credentials: MoetCredentials, batch: MoetBatch): Promise<MoetSubmitResult>;
}

/** Columns the database requires, by kind; the sandbox refuses rows where any is empty. */
export const REQUIRED_COLUMNS: Record<MoetExportKind, string[]> = {
  STUDENTS: ['Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'Lớp'],
  TEACHERS: ['Mã giáo viên', 'Họ và tên', 'Ngày sinh', 'Giới tính'],
  CLASSES: ['Lớp', 'Khối', 'Giáo viên chủ nhiệm'],
  TERM_RESULTS: ['Mã học sinh', 'Kết quả học tập', 'Kết quả rèn luyện'],
};

/** The columns that name a row in an error: its code, then its name. */
const KEY_COLUMNS: Record<MoetExportKind, [string, string]> = {
  STUDENTS: ['Mã học sinh', 'Họ và tên'],
  TEACHERS: ['Mã giáo viên', 'Họ và tên'],
  CLASSES: ['Lớp', 'Giáo viên chủ nhiệm'],
  TERM_RESULTS: ['Mã học sinh', 'Họ và tên'],
};

/**
 * Sandbox of the submission service. It refuses passwords shorter than 6 characters
 * (as a wrong password), an account containing "mock-down" (as the service being down),
 * and each row with a required column empty; it accepts everything else.
 */
export class MockMoetGateway implements MoetGateway {
  private readonly logger = new Logger('MockMoetGateway');
  readonly name = 'mock-csdl';

  async submit(credentials: MoetCredentials, batch: MoetBatch): Promise<MoetSubmitResult> {
    if (credentials.username.includes('mock-down')) throw new Error('Hệ thống CSDL ngành đang bảo trì, vui lòng gửi lại sau');
    if (credentials.password.length < 6) throw new Error('Sai tên đăng nhập hoặc mật khẩu tài khoản CSDL ngành');
    const required = REQUIRED_COLUMNS[batch.kind].map((name) => ({ name, at: batch.header.indexOf(name) }));
    const codeAt = batch.header.indexOf(KEY_COLUMNS[batch.kind][0]);
    const nameAt = batch.header.indexOf(KEY_COLUMNS[batch.kind][1]);
    const rejected: MoetRowError[] = [];
    batch.rows.forEach((row, i) => {
      const missing = required.filter((c) => c.at < 0 || row[c.at] === '' || row[c.at] === null || row[c.at] === undefined).map((c) => c.name);
      if (missing.length) rejected.push({ row: i + 1, code: String(row[codeAt] ?? ''), name: String(row[nameAt] ?? ''), message: `Thiếu ${missing.join(', ')}` });
    });
    this.logger.debug(`${batch.target} ${batch.kind} ${batch.schoolCode}: ${batch.rows.length - rejected.length}/${batch.rows.length} accepted`);
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return { batchId: `${batch.target === MoetTarget.MOET ? 'CSDL' : 'SO'}-${day}-${randomBytes(3).toString('hex').toUpperCase()}`, accepted: batch.rows.length - rejected.length, rejected };
  }
}

/** The gateway named by MOET_SYNC_PROVIDER; only "mock" exists until the authority grants API access. */
export function moetGatewayFactory(): MoetGateway {
  const provider = process.env.MOET_SYNC_PROVIDER ?? 'mock';
  if (provider !== 'mock') throw new Error(`MOET sync provider "${provider}" is not implemented; see docs/messaging-sync-esign.md`);
  return new MockMoetGateway();
}

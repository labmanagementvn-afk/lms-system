import { ScoreKind } from '@prisma/client';
import { dateLine, headerLayout, slug } from '../reports/document';
import { columnLabel, lockCovers } from './control.service';
import { exemptTerms } from './results';

describe('lockCovers', () => {
  const lock = { gradeLevel: 9, subjectId: 's1', kind: ScoreKind.TX, index: 2 };
  it('matches the locked column only', () => {
    expect(lockCovers(lock, 9, 's1', ScoreKind.TX, 2)).toBe(true);
    expect(lockCovers(lock, 9, 's1', ScoreKind.TX, 1)).toBe(false);
    expect(lockCovers(lock, 8, 's1', ScoreKind.TX, 2)).toBe(false);
    expect(lockCovers(lock, 9, 's2', ScoreKind.TX, 2)).toBe(false);
  });
  it('treats a null subject and index 0 as wildcards', () => {
    const all = { gradeLevel: 9, subjectId: null, kind: ScoreKind.TX, index: 0 };
    expect(lockCovers(all, 9, 'any', ScoreKind.TX, 4)).toBe(true);
    expect(lockCovers(all, 9, 'any', ScoreKind.GK, 1)).toBe(false);
  });
  it('labels columns', () => {
    expect(columnLabel(ScoreKind.TX, 3)).toBe('TX3');
    expect(columnLabel(ScoreKind.CK, 0)).toBe('CK');
  });
});

describe('exemptTerms', () => {
  it('spreads a year exemption over both semesters', () => {
    expect(exemptTerms([{ semester: 0 }])).toEqual({ hk1: true, hk2: true, year: true });
  });
  it('keeps the year when only one semester is exempt', () => {
    expect(exemptTerms([{ semester: 1 }])).toEqual({ hk1: true, hk2: false, year: false });
    expect(exemptTerms([{ semester: 1 }, { semester: 2 }])).toEqual({ hk1: true, hk2: true, year: true });
    expect(exemptTerms([])).toEqual({ hk1: false, hk2: false, year: false });
  });
});

describe('report documents', () => {
  it('builds two header rows for grouped columns', () => {
    const l = headerLayout([{ header: 'STT' }, { header: 'TX1', group: 'ĐĐGtx' }, { header: 'TX2', group: 'ĐĐGtx' }, { header: 'GK' }]);
    expect(l.rows).toBe(2);
    expect(l.top).toEqual([
      { label: 'STT', start: 0, span: 1, rowSpan: 2 },
      { label: 'ĐĐGtx', start: 1, span: 2, rowSpan: 1 },
      { label: 'GK', start: 3, span: 1, rowSpan: 2 },
    ]);
    expect(l.second.map((c) => c.label)).toEqual(['TX1', 'TX2']);
  });
  it('writes the Vietnamese date line and ASCII file names', () => {
    expect(dateLine('Đồng Nai', new Date('2026-10-09T20:00:00Z'))).toBe('Đồng Nai, ngày 10 tháng 10 năm 2026');
    expect(dateLine(null, new Date('2026-01-05T03:00:00Z'))).toBe('Ngày 05 tháng 01 năm 2026');
    expect(dateLine('Hà Nội', new Date('2026-03-01T03:00:00Z'))).toBe('Hà Nội, ngày 01 tháng 3 năm 2026');
    expect(slug('Bảng điểm Toán 9/11 – Học kỳ I')).toBe('bang-diem-toan-9-11-hoc-ky-i');
  });
});

import { SmsAudience } from '@prisma/client';
import { fillPlaceholders, personalise, segmentsOf, toPlain, unknownPlaceholders } from './sms-text';

describe('SMS text', () => {
  it('strips Vietnamese diacritics for a plain SMS', () => {
    expect(toPlain('Kính gửi phụ huynh em Đặng Thu Trang, lớp 9A1: họp lúc 8 giờ.')).toBe('Kinh gui phu huynh em Dang Thu Trang, lop 9A1: hop luc 8 gio.');
    expect(toPlain('“Thông báo” – học phí… 🙂')).toBe('"Thong bao" - hoc phi... ?');
  });

  it('counts SMS the way carriers do', () => {
    expect(segmentsOf('a'.repeat(160), false)).toBe(1);
    expect(segmentsOf('a'.repeat(161), false)).toBe(2);
    expect(segmentsOf('a'.repeat(306), false)).toBe(2);
    expect(segmentsOf('a'.repeat(307), false)).toBe(3);
    // Characters of the extension table take two places.
    expect(segmentsOf('{'.repeat(80), false)).toBe(1);
    expect(segmentsOf('{'.repeat(81), false)).toBe(2);
    expect(segmentsOf('ơ'.repeat(70), true)).toBe(1);
    expect(segmentsOf('ơ'.repeat(71), true)).toBe(2);
    expect(segmentsOf('ơ'.repeat(135), true)).toBe(3);
    expect(segmentsOf('', true)).toBe(0);
  });

  it('fills placeholders and reports the ones an audience does not have', () => {
    expect(fillPlaceholders('Em {hoc_sinh} ({lop}) {khac}', { hoc_sinh: 'An', lop: '6A1' })).toBe('Em An (6A1) {khac}');
    expect(unknownPlaceholders('{hoc_sinh} {giao_vien} {lop} {giao_vien}', SmsAudience.PARENT)).toEqual(['giao_vien']);
    expect(unknownPlaceholders('{giao_vien} {truong}', SmsAudience.TEACHER)).toEqual([]);
  });

  it('personalises and counts each recipient’s text', () => {
    expect(personalise('Em {hoc_sinh} nghỉ học hôm nay.', { hoc_sinh: 'Lê Gia Hân' }, false)).toEqual({ text: 'Em Le Gia Han nghi hoc hom nay.', segments: 1 });
    expect(personalise(' Em {hoc_sinh} nghỉ học. ', { hoc_sinh: 'Lê Gia Hân' }, true)).toEqual({ text: 'Em Lê Gia Hân nghỉ học.', segments: 1 });
  });
});

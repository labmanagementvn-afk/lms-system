import { SmsAudience } from '@prisma/client';

/** The longest text one recipient may get, in SMS. */
export const MAX_SEGMENTS = 4;

/** What each placeholder stands for, by audience. */
export const PLACEHOLDERS: Record<SmsAudience, Record<string, string>> = {
  PARENT: {
    hoc_sinh: 'Họ và tên học sinh',
    ma_hs: 'Mã học sinh',
    lop: 'Lớp',
    phu_huynh: 'Họ và tên phụ huynh',
    truong: 'Tên trường',
    ngay: 'Ngày gửi',
  },
  TEACHER: {
    giao_vien: 'Họ và tên giáo viên',
    truong: 'Tên trường',
    ngay: 'Ngày gửi',
  },
};

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** Placeholders in a text that the audience does not have. */
export function unknownPlaceholders(body: string, audience: SmsAudience): string[] {
  const known = PLACEHOLDERS[audience];
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !(name in known)))];
}

/** Fills {name} placeholders; unknown ones stay as written. */
export function fillPlaceholders(body: string, values: Record<string, string>): string {
  return body.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
}

// GSM 03.38: the basic alphabet takes one character, the extension table two.
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXTENDED = new Set('^{}\\[~]|€');
const LOOKALIKES: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', ' ': ' ', '\t': ' ', '`': "'" };

/**
 * The text as a plain (không dấu) SMS: Vietnamese letters lose their marks, typographic
 * quotes and dashes become ASCII, and anything the GSM alphabet cannot carry becomes "?".
 */
export function toPlain(text: string): string {
  const stripped = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  let out = '';
  for (const ch of stripped) {
    const c = LOOKALIKES[ch] ?? ch;
    out += [...c].every((x) => GSM_BASIC.has(x) || GSM_EXTENDED.has(x)) ? c : '?';
  }
  return out;
}

/**
 * How many SMS a text takes: 160 GSM characters for one (153 each when split), or with
 * diacritics (UCS-2) 70 for one and 67 each when split.
 */
export function segmentsOf(text: string, accented: boolean): number {
  if (!text.length) return 0;
  if (accented) return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  let units = 0;
  for (const ch of text) units += GSM_EXTENDED.has(ch) ? 2 : 1;
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

/** The text one recipient gets: placeholders filled, and stripped of diacritics unless accented. */
export function personalise(body: string, values: Record<string, string>, accented: boolean): { text: string; segments: number } {
  const filled = fillPlaceholders(body, values).normalize('NFC').trim();
  const text = accented ? filled : toPlain(filled);
  return { text, segments: segmentsOf(text, accented) };
}

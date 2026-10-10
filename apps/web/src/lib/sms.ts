// SMS length rules, mirrored from the API (apps/api/src/sms/sms-text.ts) for the live counter.

const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXTENDED = new Set('^{}\\[~]|€');
const LOOKALIKES: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', ' ': ' ', '\t': ' ', '`': "'" };

/** The text as a plain SMS: no diacritics, ASCII quotes and dashes, "?" for what GSM cannot carry. */
export function toPlain(text: string): string {
  const stripped = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  let out = '';
  for (const ch of stripped) {
    const c = LOOKALIKES[ch] ?? ch;
    out += [...c].every((x) => GSM_BASIC.has(x) || GSM_EXTENDED.has(x)) ? c : '?';
  }
  return out;
}

/** Characters it takes and how many SMS: 160 per SMS (153 when split), or 70 (67) with diacritics. */
export function smsLength(text: string, accented: boolean): { chars: number; segments: number; perSms: number } {
  if (accented) {
    const chars = text.normalize('NFC').length;
    return { chars, segments: chars === 0 ? 0 : chars <= 70 ? 1 : Math.ceil(chars / 67), perSms: chars <= 70 ? 70 : 67 };
  }
  let chars = 0;
  for (const ch of toPlain(text)) chars += GSM_EXTENDED.has(ch) ? 2 : 1;
  return { chars, segments: chars === 0 ? 0 : chars <= 160 ? 1 : Math.ceil(chars / 153), perSms: chars <= 160 ? 160 : 153 };
}

/** Typical values used to estimate a text's length before the real recipients are known. */
export const SAMPLE_VALUES: Record<string, string> = {
  hoc_sinh: 'Nguyễn Thị Minh Anh',
  ma_hs: 'HS0001',
  lop: '6A1',
  phu_huynh: 'Nguyễn Văn Bình',
  truong: 'Trường THCS',
  ngay: '05/10/2026',
  giao_vien: 'Nguyễn Thị Hồng',
};

export const fillSample = (body: string, values: Record<string, string> = {}) => body.replace(/\{([a-z_]+)\}/g, (whole, name: string) => values[name] ?? SAMPLE_VALUES[name] ?? whole);

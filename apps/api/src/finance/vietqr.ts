// VietQR (NAPAS 247) payload builder, following the EMVCo merchant-presented QR
// format that Vietnamese banking apps scan. No network call or credential needed.

const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as required by EMVCo tag 63. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Strips Vietnamese diacritics and anything banks reject in the transfer note. */
export function toTransferText(s: string, max = 50): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface VietQrInput {
  bankBin: string;
  accountNo: string;
  amount?: number;
  /** Transfer note; should contain the invoice payment reference. */
  message?: string;
}

export function buildVietQr({ bankBin, accountNo, amount, message }: VietQrInput): string {
  if (!/^\d{6}$/.test(bankBin)) throw new Error('bankBin must be a 6-digit NAPAS BIN');
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNo)) throw new Error('invalid account number');
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bankBin) + tlv('01', accountNo)) + tlv('02', 'QRIBFTTA');
  let payload =
    tlv('00', '01') +
    tlv('01', amount ? '12' : '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (amount ? tlv('54', String(Math.round(amount))) : '') +
    tlv('58', 'VN');
  const note = message ? toTransferText(message, 25) : '';
  if (note) payload += tlv('62', tlv('08', note));
  payload += '6304';
  return payload + crc16(payload);
}

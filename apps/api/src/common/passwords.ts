import { randomInt } from 'crypto';

// No 0/O/1/l/I so a password read out over the phone is not misheard.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Random first-time password for accounts the school creates (parents, drivers, staff). */
export function generatePassword(length = 8): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

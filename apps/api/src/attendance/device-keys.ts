import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Device API keys look like `sk_dev_<prefix>.<secret>`. Only the prefix (for
// lookup) and a SHA-256 hash of the full key are stored.
const PATTERN = /^sk_dev_([a-f0-9]{12})\.([A-Za-z0-9_-]{32,})$/;

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

export function generateDeviceKey() {
  const prefix = randomBytes(6).toString('hex');
  const key = `sk_dev_${prefix}.${randomBytes(32).toString('base64url')}`;
  return { key, prefix, hash: hash(key) };
}

export function parseDeviceKey(key: string): string | null {
  return PATTERN.exec(key)?.[1] ?? null;
}

export function verifyDeviceKey(key: string, storedHash: string): boolean {
  const a = Buffer.from(hash(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

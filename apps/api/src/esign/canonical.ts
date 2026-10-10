import { createHash } from 'crypto';

/** The value as JSON would carry it: dates become ISO strings, undefined fields go away. */
export function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * JSON with object keys sorted at every level, so the same content always gives the
 * same text, whatever order a database (JSONB) hands its keys back in.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** SHA-256 of the canonical JSON of a value. */
export const contentHash = (value: unknown) => sha256(canonicalJson(value));

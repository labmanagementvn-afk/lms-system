// Scrubs request bodies before they go into the audit log: secrets are replaced,
// long strings are cut and the whole thing is capped so one call cannot bloat the table.

const SECRET_KEY = /pass(word|phrase)?|secret|token|api[-_]?key|otp|pin|credential|authorization/i;
const MAX_STRING = 500;
/** Serialized size above which only a preview is kept. */
export const MAX_BODY_BYTES = 4096;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} ký tự)` : value;
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? '[đã ẩn]' : redact(v, depth + 1);
  }
  return out;
}

/** Redacted, size-capped copy of a request body suitable for a Json column (undefined when there is nothing to keep). */
export function auditBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0) return undefined;
  const clean = redact(body);
  const text = JSON.stringify(clean);
  if (text === undefined) return undefined;
  if (Buffer.byteLength(text, 'utf8') <= MAX_BODY_BYTES) return clean;
  return { _truncated: true, bytes: Buffer.byteLength(text, 'utf8'), preview: text.slice(0, MAX_BODY_BYTES - 200) };
}

/** "finance" from "/api/v1/finance/invoices/abc"; "iclock" style paths without the prefix keep their first segment. */
export function areaOf(path: string): string {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const i = parts[0] === 'api' && /^v\d+$/.test(parts[1] ?? '') ? 2 : 0;
  return parts[i] ?? '';
}

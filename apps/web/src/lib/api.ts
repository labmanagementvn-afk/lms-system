export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'lms.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode); the session just won't persist
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const token = getToken();
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.href = '/login';
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? res.statusText);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

/** Uploads one file as multipart/form-data (POST /uploads, /uploads/scorm) and returns the stored file. */
export async function apiUpload<T = any>(path: string, file: File | Blob, fileName?: string): Promise<T> {
  const form = new FormData();
  form.append('file', file, fileName ?? (file instanceof File ? file.name : 'file'));
  const token = getToken();
  const res = await fetch(API_URL + path, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? res.statusText);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

/** URL of an uploaded file for <video>, <img>, <iframe> and download links; the token travels in the query string. */
export const fileUrl = (id: string) => `${API_URL}/uploads/${id}?access_token=${encodeURIComponent(getToken() ?? '')}`;
/** Launch page of an extracted SCORM package (public by unguessable id). */
export const scormUrl = (id: string, launchPath: string) => `${API_URL}/uploads/scorm/${id}/${launchPath}`;

/** SWR fetcher: key is [path, query?]. */
export const fetcher = ([path, query]: [string, Record<string, unknown>?]) => api(path, { query });

/** Drops empty strings and nulls from form values so optional fields are omitted. */
export function clean<T extends Record<string, any>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined)) as Partial<T>;
}

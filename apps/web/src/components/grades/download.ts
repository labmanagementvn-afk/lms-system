import { API_URL, ApiError, getToken } from '@/lib/api';

/** Fetches a file route (CSV, PDF, Excel) with the bearer token and hands it to the browser as a download. */
export async function downloadFile(path: string, query: Record<string, unknown>, filename: string) {
  const url = new URL(API_URL + path, globalThis.location?.origin);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? msg);
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export const downloadCsv = downloadFile;

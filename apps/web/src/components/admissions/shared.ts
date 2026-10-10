// Shared constants and helpers of the admissions pages.
import dayjs from 'dayjs';
import { API_URL, ApiError, getToken } from '@/lib/api';

export const UNIFORM_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const EXTRAS = ['CLB bóng đá', 'CLB tiếng Anh', 'CLB mỹ thuật', 'Bán trú thứ 7'];

/** Status moves the office may make by hand; ENROLLED goes through "Nhập học". */
export const STATUS_ACTIONS: Record<string, { to: string; label: string; danger?: boolean; needsNote?: boolean }[]> = {
  SUBMITTED: [
    { to: 'SCREENING', label: 'Bắt đầu xét duyệt' },
    { to: 'WITHDRAWN', label: 'Rút hồ sơ', danger: true, needsNote: true },
  ],
  SCREENING: [
    { to: 'ACCEPTED', label: 'Trúng tuyển' },
    { to: 'REJECTED', label: 'Không đạt', danger: true, needsNote: true },
    { to: 'WITHDRAWN', label: 'Rút hồ sơ', danger: true, needsNote: true },
  ],
  ACCEPTED: [{ to: 'WITHDRAWN', label: 'Rút hồ sơ', danger: true, needsNote: true }],
};

export const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '');
export const fmtDateTime = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '');

export interface Uniform {
  shirtSize?: string | null;
  pantsSize?: string | null;
  quantity?: number | null;
}

/** "Áo M · Quần L × 2" */
export function uniformText(u?: Uniform | null): string {
  if (!u || (!u.shirtSize && !u.pantsSize)) return '';
  const parts = [u.shirtSize && `Áo ${u.shirtSize}`, u.pantsSize && `Quần ${u.pantsSize}`].filter(Boolean);
  return `${parts.join(' · ')} × ${u.quantity ?? 1}`;
}

/** Downloads a CSV endpoint (which needs the bearer token) as a file. */
export async function downloadCsv(path: string, query: Record<string, unknown>, filename: string) {
  const url = new URL(API_URL + path, globalThis.location?.origin);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).message ?? message;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được file'));
    reader.readAsText(file, 'utf-8');
  });
}

/** Saves text as a file from the browser (used for the import template). */
export function saveTextFile(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

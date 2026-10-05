// Display helpers shared by the LMS portal pages and the student app.
export { formatTime } from '@/lib/time';

/** "05/10/2026 19:30" in the school's timezone. */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** "05/10/2026" in the school's timezone. */
export function formatDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

/** Seconds as "1 giờ 05 phút" / "12 phút" / "45 giây". */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s} giây`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} giờ ${String(m).padStart(2, '0')} phút`;
  return `${m} phút`;
}

/** Time until / since an instant, in words: "còn 2 giờ 10 phút", "đã qua 3 ngày". */
export function countdown(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const text =
    minutes < 1 ? 'chưa đầy 1 phút' : minutes < 60 ? `${minutes} phút` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${Math.round(minutes / 60 / 24)} ngày`;
  return diff >= 0 ? `còn ${text}` : `đã qua ${text}`;
}

/** Embed URL of a YouTube watch / short / share link, or null when the url is not YouTube. */
export function youtubeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = /^\/(embed|shorts|live|v)\/([^/?]+)/.exec(u.pathname);
        if (m) id = m[2];
      }
    }
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

/** Plain text with blank-line paragraphs, as the TEXT lesson editor stores it. */
export const paragraphs = (text: string | null | undefined): string[] =>
  (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// Display helpers shared by the announcements page and drawers.
import { ROLE } from '@/lib/labels';

/** "05/10/2026 07:30" in the school's timezone. */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** { PARENT: 120, TEACHER: 4 } -> "Phụ huynh: 120, Giáo viên: 4" */
export function describeRoles(byRole: Record<string, number> | undefined): string {
  const parts = Object.entries(byRole ?? {}).map(([role, n]) => `${ROLE[role] ?? role}: ${n}`);
  return parts.length ? parts.join(', ') : 'không có ai';
}

/** Human summary of an audience: roles, classes (by name) and grade levels. */
export function describeAudience(audience: { roles: string[]; classIds: string[]; gradeLevels: number[] } | undefined, classes: any[] | undefined): string {
  if (!audience) return '';
  const parts: string[] = [];
  if (audience.roles.length) parts.push(audience.roles.map((r) => ROLE[r] ?? r).join(', '));
  if (audience.classIds.length) parts.push(`Lớp ${audience.classIds.map((id) => classes?.find((c) => c.id === id)?.name ?? '?').join(', ')}`);
  if (audience.gradeLevels.length) parts.push(`Khối ${audience.gradeLevels.join(', ')}`);
  return parts.join(' · ') || 'Chưa chọn';
}

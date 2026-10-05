import { LiveStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Students may enter a scheduled room this many minutes before it starts. */
export const JOIN_BEFORE_MS = 15 * 60_000;

/** Unguessable Jitsi room: `lms-<school code>-<10 random chars>`. */
export function makeRoomName(schoolCode: string, random: () => Buffer = () => randomBytes(10)): string {
  const bytes = random();
  let suffix = '';
  for (let i = 0; i < 10; i++) suffix += ALPHABET[bytes[i % bytes.length] % ALPHABET.length];
  const code = schoolCode.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `lms-${code || 'school'}-${suffix}`;
}

/** Public Jitsi Meet room; no account or credentials needed. */
export const joinUrl = (roomName: string) => `https://meet.jit.si/${roomName}`;

/** A student may join a LIVE room, or a SCHEDULED one from 15 minutes before its start. */
export function canJoin(session: { status: LiveStatus; startsAt: Date }, now = new Date()): boolean {
  if (session.status === LiveStatus.LIVE) return true;
  if (session.status !== LiveStatus.SCHEDULED) return false;
  return session.startsAt.getTime() - now.getTime() <= JOIN_BEFORE_MS;
}

/** Sort for listings: running rooms first, then upcoming (soonest first), then past (latest first). */
export function compareSessions(a: { status: LiveStatus; startsAt: Date }, b: { status: LiveStatus; startsAt: Date }): number {
  const rank = (s: LiveStatus) => (s === LiveStatus.LIVE ? 0 : s === LiveStatus.SCHEDULED ? 1 : 2);
  const d = rank(a.status) - rank(b.status);
  if (d) return d;
  return rank(a.status) === 1 ? a.startsAt.getTime() - b.startsAt.getTime() : b.startsAt.getTime() - a.startsAt.getTime();
}

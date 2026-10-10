// The parts of the sổ chủ nhiệm kept as JSON (ban cán sự lớp, ban đại diện cha mẹ học sinh,
// tổ and the seating chart) and the year plan. Pure checks against the class roster, so
// they are unit tested; each throws a 400 with the message the teacher sees.
import { BadRequestException } from '@nestjs/common';
import { StudentNoteKind } from '@prisma/client';

export const NOTE_KIND_LABEL: Record<StudentNoteKind, string> = {
  ATTENTION: 'Cần quan tâm, giúp đỡ',
  OUTSTANDING: 'Có thành tích nổi bật',
  PROGRESS: 'Có tiến bộ',
  OTHER: 'Khác',
};

export type Officer = {
  role: string;
  studentId: string;
};

export type CommitteeMember = {
  role: string;
  guardianId: string;
};

export type Group = {
  name: string;
  leaderId: string | null;
  studentIds: string[];
};

/** seats[row][column * seatsPerDesk + seat] holds a student id; row 0 is the desk nearest the board. */
export type Seating = {
  columns: number;
  rows: number;
  seatsPerDesk: number;
  seats: (string | null)[][];
};

export const PLAN_KEYS = ['situation', 'goals', 'targets', 'measures'] as const;
export type YearPlan = Partial<Record<(typeof PLAN_KEYS)[number], string>>;

/** Student id to full name: the students studying in the class. */
export type Roster = Map<string, string>;

/** A stored JSON list, or empty when the column holds something else. */
export const jsonList = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The stored year plan, or an empty one. */
export const jsonPlan = (v: unknown): YearPlan => (v && typeof v === 'object' && !Array.isArray(v) ? (v as YearPlan) : {});

/** A stored seating chart, or null when there is none or it is malformed. */
export function jsonSeating(v: unknown): Seating | null {
  const s = v as Seating | null;
  return s && typeof s === 'object' && Array.isArray(s.seats) && s.columns > 0 && s.rows > 0 && s.seatsPerDesk > 0 ? s : null;
}

/** Ban cán sự lớp: each role held by a student of the class; blank roles and repeats are dropped. */
export function cleanOfficers(items: Officer[], roster: Roster): Officer[] {
  const out: Officer[] = [];
  for (const o of items) {
    const role = o.role.trim();
    if (!role) continue;
    if (!roster.has(o.studentId)) throw new BadRequestException(`${role}: học sinh không thuộc lớp`);
    if (!out.some((x) => x.role.toLowerCase() === role.toLowerCase() && x.studentId === o.studentId)) out.push({ role, studentId: o.studentId });
  }
  return out;
}

/** Ban đại diện cha mẹ học sinh: parents of students in the class, each holding one role. */
export function cleanCommittee(items: CommitteeMember[], guardians: Set<string>): CommitteeMember[] {
  const seen = new Set<string>();
  const out: CommitteeMember[] = [];
  for (const m of items) {
    const role = m.role.trim();
    if (!role) continue;
    if (!guardians.has(m.guardianId)) throw new BadRequestException(`${role}: không phải cha mẹ của học sinh trong lớp`);
    if (seen.has(m.guardianId)) throw new BadRequestException('Mỗi phụ huynh chỉ giữ một chức vụ trong ban đại diện');
    seen.add(m.guardianId);
    out.push({ role, guardianId: m.guardianId });
  }
  return out;
}

/** Tổ: distinct names, each student in at most one tổ, and the tổ trưởng one of its members. */
export function cleanGroups(items: { name: string; leaderId?: string | null; studentIds: string[] }[], roster: Roster): Group[] {
  const names = new Set<string>();
  const placed = new Map<string, string>();
  return items.map((g) => {
    const name = g.name.trim();
    if (!name) throw new BadRequestException('Nhập tên tổ');
    if (names.has(name.toLowerCase())) throw new BadRequestException(`Trùng tên tổ: ${name}`);
    names.add(name.toLowerCase());
    const studentIds = [...new Set(g.studentIds)];
    for (const id of studentIds) {
      if (!roster.has(id)) throw new BadRequestException(`${name}: có học sinh không thuộc lớp`);
      const other = placed.get(id);
      if (other) throw new BadRequestException(`${roster.get(id)} đã ở ${other}`);
      placed.set(id, name);
    }
    const leaderId = g.leaderId || null;
    if (leaderId && !studentIds.includes(leaderId)) throw new BadRequestException(`${name}: tổ trưởng phải là thành viên của tổ`);
    return { name, leaderId, studentIds };
  });
}

/** Sơ đồ chỗ ngồi: a full grid of rows × (columns × seatsPerDesk) seats, each student in at most one. */
export function cleanSeating(s: Seating, roster: Roster): Seating {
  const width = s.columns * s.seatsPerDesk;
  if (!Array.isArray(s.seats) || s.seats.length !== s.rows || s.seats.some((row) => !Array.isArray(row) || row.length !== width)) {
    throw new BadRequestException(`Sơ đồ chỗ ngồi phải có ${s.rows} hàng bàn, mỗi hàng ${width} chỗ`);
  }
  const seen = new Set<string>();
  const seats = s.seats.map((row) =>
    row.map((id) => {
      if (id === null || id === '') return null;
      if (typeof id !== 'string' || !roster.has(id)) throw new BadRequestException('Sơ đồ chỗ ngồi có học sinh không thuộc lớp');
      if (seen.has(id)) throw new BadRequestException(`${roster.get(id)} được xếp hai chỗ`);
      seen.add(id);
      return id;
    }),
  );
  return { columns: s.columns, rows: s.rows, seatsPerDesk: s.seatsPerDesk, seats };
}

/** Kế hoạch chủ nhiệm năm học: parts sent replace those kept, a blank or null part clears it, parts left out stay. */
export function mergePlan(kept: YearPlan, sent: Partial<Record<(typeof PLAN_KEYS)[number], string | null>>): YearPlan {
  const out: YearPlan = { ...kept };
  for (const k of PLAN_KEYS) {
    const v = sent[k];
    if (v === undefined) continue;
    if (v && v.trim()) out[k] = v.trim();
    else delete out[k];
  }
  return out;
}

/**
 * The school days a sổ chủ nhiệm covers: from the first day of the school year to the end
 * of August, so the summer after it (retakes, rèn luyện trong hè) can still be written down.
 */
export function bookSpan(year: { startDate: string; endDate: string }) {
  return { from: year.startDate, to: `${year.endDate.slice(0, 4)}-08-31` };
}

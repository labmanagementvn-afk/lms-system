export interface Slot {
  id?: string;
  classId: string;
  teacherId: string;
  room?: string | null;
  dayOfWeek: number;
  periodNumber: number;
}

export type ConflictKind = 'CLASS' | 'TEACHER' | 'ROOM';

export interface Conflict {
  kind: ConflictKind;
  entryId?: string;
}

const normalizeRoom = (room?: string | null) => room?.trim().toLowerCase() || null;

/**
 * Returns the clashes `candidate` would have with `existing` entries of the same
 * academic year and semester: the class, the teacher or the room already busy in that slot.
 */
export function findConflicts(candidate: Slot, existing: Slot[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const room = normalizeRoom(candidate.room);
  for (const e of existing) {
    if (e.id && e.id === candidate.id) continue;
    if (e.dayOfWeek !== candidate.dayOfWeek || e.periodNumber !== candidate.periodNumber) continue;
    if (e.classId === candidate.classId) conflicts.push({ kind: 'CLASS', entryId: e.id });
    if (e.teacherId === candidate.teacherId) conflicts.push({ kind: 'TEACHER', entryId: e.id });
    if (room && normalizeRoom(e.room) === room && e.classId !== candidate.classId) {
      conflicts.push({ kind: 'ROOM', entryId: e.id });
    }
  }
  return conflicts;
}

export const conflictMessages: Record<ConflictKind, string> = {
  CLASS: 'Lớp đã có tiết học vào thời điểm này',
  TEACHER: 'Giáo viên đã có tiết dạy vào thời điểm này',
  ROOM: 'Phòng học đã được sử dụng vào thời điểm này',
};

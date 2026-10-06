import { LessonType } from '@prisma/client';

export interface LessonFields {
  content?: string | null;
  fileId?: string | null;
  url?: string | null;
  testId?: string | null;
}

export interface LessonRefs {
  /** The StoredFile behind fileId, or null when fileId is set but unknown to the school. */
  file?: { launchPath: string | null } | null;
  /** Whether testId names a test of the school. */
  testExists?: boolean;
}

/** The Vietnamese validation message for a lesson of `type`, or null when it is complete. */
export function lessonValidationError(type: LessonType, fields: LessonFields, refs: LessonRefs = {}): string | null {
  const has = (v: string | null | undefined) => !!v && v.trim().length > 0;
  if (has(fields.fileId) && refs.file === null) return 'Không tìm thấy tệp đã tải lên';
  switch (type) {
    case LessonType.VIDEO:
    case LessonType.DOCUMENT:
      return has(fields.fileId) || has(fields.url) ? null : 'Bài học cần một tệp tải lên hoặc đường dẫn';
    case LessonType.SCORM:
      if (!has(fields.fileId)) return 'Bài học SCORM cần gói SCORM đã tải lên';
      return refs.file?.launchPath ? null : 'Tệp đã chọn không phải gói SCORM';
    case LessonType.LINK:
    case LessonType.H5P:
      return has(fields.url) ? null : 'Bài học cần đường dẫn';
    case LessonType.TEXT:
      return has(fields.content) ? null : 'Bài đọc cần nội dung';
    case LessonType.QUIZ:
      if (!has(fields.testId)) return 'Bài kiểm tra cần chọn một đề';
      return refs.testExists ? null : 'Không tìm thấy bài kiểm tra';
    default:
      return null;
  }
}

/** Sections in order, each with its lessons in order, then the unsectioned lessons: the reading order of a course. */
export function flattenLessons<L extends { sectionId: string | null; sortOrder: number }>(sections: { id: string; sortOrder: number }[], lessons: L[]): L[] {
  const byOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;
  const out: L[] = [];
  for (const s of [...sections].sort(byOrder)) out.push(...lessons.filter((l) => l.sectionId === s.id).sort(byOrder));
  out.push(...lessons.filter((l) => !l.sectionId || !sections.some((s) => s.id === l.sectionId)).sort(byOrder));
  return out;
}

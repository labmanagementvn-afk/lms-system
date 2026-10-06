import { LessonType } from '@prisma/client';
import { flattenLessons, lessonValidationError } from './lessons';

describe('lesson validation', () => {
  it('requires a file or url for videos and documents', () => {
    expect(lessonValidationError(LessonType.VIDEO, {})).toBeTruthy();
    expect(lessonValidationError(LessonType.VIDEO, { url: 'https://youtu.be/x' })).toBeNull();
    expect(lessonValidationError(LessonType.DOCUMENT, { fileId: 'f1' }, { file: { launchPath: null } })).toBeNull();
    expect(lessonValidationError(LessonType.DOCUMENT, { fileId: 'missing' }, { file: null })).toBe('Không tìm thấy tệp đã tải lên');
  });

  it('requires an unpacked SCORM package', () => {
    expect(lessonValidationError(LessonType.SCORM, {})).toBeTruthy();
    expect(lessonValidationError(LessonType.SCORM, { fileId: 'f1' }, { file: { launchPath: null } })).toBe('Tệp đã chọn không phải gói SCORM');
    expect(lessonValidationError(LessonType.SCORM, { fileId: 'f1' }, { file: { launchPath: 'index.html' } })).toBeNull();
  });

  it('requires a url, text or an existing test for the other types', () => {
    expect(lessonValidationError(LessonType.LINK, {})).toBeTruthy();
    expect(lessonValidationError(LessonType.H5P, { url: 'https://h5p.org/x' })).toBeNull();
    expect(lessonValidationError(LessonType.TEXT, { content: '   ' })).toBeTruthy();
    expect(lessonValidationError(LessonType.TEXT, { content: 'Bài đọc' })).toBeNull();
    expect(lessonValidationError(LessonType.QUIZ, {})).toBeTruthy();
    expect(lessonValidationError(LessonType.QUIZ, { testId: 't1' }, { testExists: false })).toBe('Không tìm thấy bài kiểm tra');
    expect(lessonValidationError(LessonType.QUIZ, { testId: 't1' }, { testExists: true })).toBeNull();
  });
});

describe('flattenLessons', () => {
  it('reads sections in order, then the unsectioned lessons', () => {
    const sections = [
      { id: 's2', sortOrder: 1 },
      { id: 's1', sortOrder: 0 },
    ];
    const lessons = [
      { id: 'c', sectionId: 's2', sortOrder: 0 },
      { id: 'b', sectionId: 's1', sortOrder: 1 },
      { id: 'e', sectionId: null, sortOrder: 0 },
      { id: 'a', sectionId: 's1', sortOrder: 0 },
      { id: 'd', sectionId: 'gone', sortOrder: 0 },
    ];
    expect(flattenLessons(sections, lessons).map((l) => l.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
});

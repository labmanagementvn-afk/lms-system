# Gradebook, conduct, student accounts and e-learning

Phase 4 adds the academic records the Vietnamese regulations ask for (sổ điểm, học bạ, rèn luyện)
and an e-learning layer (courses, lessons, question bank, tests, contests, live classes) with a
student app at `/student`.

## Student accounts

| Role | Logs in with | Sees |
| --- | --- | --- |
| `STUDENT` | student code (`hs2026001`) | the student app (`/student`): own courses, tests, marks, conduct |

Accounts are created by the school from student records (`POST /students/accounts`,
`POST /students/accounts/bulk`, page *Tài khoản học sinh*). The username is the student code in
lower case (a school-code suffix is added only when another school already uses the code). The
first-time password is shown once and `mustChangePassword` forces a change at first login.
`StudentAccessService.current(user)` resolves the student behind a token, with their current class;
every student endpoint goes through it, so a student only ever sees their own records.
`assertStudent(user, studentId)` is the matching check for parents and staff.

Announcements addressed to a class now reach the students of that class as well as their parents.

## Gradebook (Thông tư 22/2021/TT-BGDĐT)

Each subject is assessed either by score (`SCORE`) or by comment (`COMMENT`, Đạt / Chưa đạt),
with `regularCount` regular marks per semester (2, 3 or 4 depending on periods per year); see
*Môn học & cách đánh giá*. Marks live in `Score` rows (`TX` regular, `GK` mid-term ×2,
`CK` end-of-term ×3). The pure rules in `apps/api/src/grades/tt22.ts` compute:

- subject semester average `(Σ TX + 2·GK + 3·CK) / (n + 5)`, year average `(HK1 + 2·HK2) / 3`;
- academic level (Tốt / Khá / Đạt / Chưa đạt) from the subject results;
- title (Học sinh Xuất sắc / Giỏi) once the conduct level is known;
- promotion (lên lớp / kiểm tra lại / ở lại lớp) from academic level, conduct and absences.

`SubjectResult` and `TermResult` rows are recomputed whenever marks are saved; an admin can lock a
class's semester (`GradeLock`) so marks cannot change. Parents and students are notified when a
mid-term or end-of-term mark is recorded. The transcript page (*Học bạ*) is printable.

## Conduct (rèn luyện)

A school defines its criteria (points adding up to 100). Per semester every student self-assesses
in the student app, the homeroom teacher reviews, and leadership approves; the approved total maps
to a level (≥ 90 Tốt, ≥ 70 Khá, ≥ 50 Đạt) which is written to `TermResult.conduct` for the
gradebook's titles and promotion. Parents see the result in the parent app.

## E-learning

- **Courses** belong to a teacher and target classes (`classIds`, empty = whole school). Publishing
  enrols every student of those classes. Content is organised in sections and lessons of type
  `VIDEO`, `DOCUMENT`, `SCORM`, `H5P`, `TEXT`, `LINK` or `QUIZ`. Progress per lesson rolls up to the
  enrolment's percentage; required lessons count, optional ones do not.
- **Files** are uploaded to local disk under `UPLOAD_DIR` (`POST /uploads`) and served back through
  the API with the token in the query string (`fileUrl(id)` on the web). SCORM packages
  (`POST /uploads/scorm`) are unpacked and served publicly under their unguessable id because the
  package's own pages load assets by relative path; the student lesson page provides a minimal
  SCORM 1.2 `window.API` that saves `cmi.*` into `LessonProgress.scormData` and marks the lesson
  complete on `completed` / `passed`. H5P content is embedded by URL. Object storage (S3-compatible)
  can replace the disk store by swapping `UploadsService`.
- **Question bank**: 9 question types (single / multiple choice, true-false, fill in the blank,
  short answer, numeric, matching, ordering, essay) and 6 difficulty levels, with CSV import and
  export. The answer formats are documented in `apps/api/src/assessments/grading.ts`.
- **Tests** are quizzes inside a course, exams for classes or school-wide contests. Attempts are
  auto-graded except essays, which the teacher grades; shuffling, time limits, attempt limits, open /
  close windows and result visibility are per test. Contests have a leaderboard (best score, then
  shortest time). Submitting a test linked from a `QUIZ` lesson completes that lesson.
- **Live classes** are scheduled per course and run in a Jitsi Meet room (`https://meet.jit.si/<room>`),
  which needs no account or key; the API records who joined. A self-hosted Jitsi or LiveKit can
  replace the room URL without touching the data model.
- **Discussions** are threads per course (optionally per lesson) for students and teachers.
- **Reports**: completion rates, active students, lessons by type, per-course and per-student progress.

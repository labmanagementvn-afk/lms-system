# Reports and gradebook control

Phase 6 closes the largest gaps found against Viettel SMAS 4.0 and K12Online: official reports
printed as PDF or Excel, a gradebook the office controls column by column, and score sheets that
go out to Excel and come back in.

## Reports (Báo cáo)

`GET /reports` lists the reports the user may run, each with the parameters it takes and the ones
it requires. `GET /reports/:key` builds one: JSON by default (the portal preview), or a download
with `format=pdf` or `format=xlsx`. Missing parameters are a 400 that names them.

| Group | Key | Report | Parameters (required in bold) |
| --- | --- | --- | --- |
| Hồ sơ học sinh | `class-list` | Danh sách học sinh lớp | **classId** |
| | `students-by-status` | Học sinh chuyển trường / thôi học | **status**, gradeLevel |
| | `student-stats` | Thống kê số liệu học sinh | |
| | `absences` | Thống kê học sinh nghỉ học | **from**, **to**, classId |
| | `exemptions` | Danh sách học sinh miễn học | classId |
| Kết quả học tập | `subject-scores` | Bảng điểm môn học (re-importable) | **classId**, **subjectId**, **semester** |
| | `class-results` | Bảng điểm tổng hợp | **classId**, **semester** (0 = cả năm) |
| | `score-distribution` | Thống kê điểm môn học | **subjectId**, **semester**, gradeLevel |
| | `level-stats` | Thống kê kết quả học tập, rèn luyện | **semester**, gradeLevel |
| | `titles` | Danh sách khen thưởng cuối năm | gradeLevel, classId |
| | `promotion` | Kiểm tra lại / ở lại lớp | **promotion**, gradeLevel |
| | `transcript` | Học bạ (kết quả năm học) | **studentId** |
| Quản lý sổ điểm | `entry-monitoring` | Giám sát nhập điểm (office only) | **semester**, gradeLevel |
| | `missing-scores` | Danh sách học sinh thiếu điểm | **classId**, **semester** |
| | `score-edits` | Thống kê sửa điểm (office only) | **semester**, classId, subjectId |

A report is data: `build` returns a `ReportDocument` (title, subtitles, blocks of tables, text and
label/value fields, signature) and the controller renders it with `renderPdf` (pdfkit, A4, portrait
or landscape) or `renderXlsx` (exceljs). Both draw the same administrative layout: the governing
body and school name on the left, the national motto on the right, the title, grouped table
headers that repeat on each page, page numbers, and the place-and-date line and signer block
(Nghị định 30/2020: days below 10 and months 1 and 2 take a leading zero). Fonts are Liberation
Serif (SIL OFL), bundled in `apps/api/assets/fonts` so Vietnamese prints the same everywhere.

The letterhead comes from the school profile (*Thiết lập › Trường học*): `governingBody`
(cơ quan chủ quản), `principalName` (the default signer) and `locality` (the place on the date
line, falling back to the province). Each request may override `signerTitle` (e.g. "KT. Hiệu
trưởng"), `signerName` and `place`.

To add a report, call `ReportsService.register({ key, group, name, params, required, roles, build })`
from the module that owns the data; `roles` limits who may run it.

## Gradebook control (Quản lý sổ điểm)

| Route | Who | What |
| --- | --- | --- |
| `GET/POST /grades/column-locks`, `DELETE /grades/column-locks/:id` | read: portal, write: admin | lock a column (TXn, every TX, GK or CK) of a grade level, in one subject or all |
| `GET/PUT /grades/entry-windows` | read: portal, write: admin | when teachers may enter marks in each semester, and the edit limit |
| `GET /grades/edits` | admin, staff | every mark written: old and new value, who, typed or imported |
| `GET /grades/monitor` | admin, staff | entered vs expected marks per teacher, class and subject |
| `GET /grades/monitor/missing` | portal | per student and subject of a class, the columns still empty |
| `GET/POST /grades/exemptions`, `DELETE /grades/exemptions/:id` | read: portal, write: admin, staff | miễn học for a semester or the year |
| `GET/PUT /grades/visibility` | read: portal, write: admin | what the parent and student apps show |

- **Column locks** bind everyone, the office included; unlock to correct a mark. They sit beside
  the existing class lock (*Khóa sổ điểm*), which freezes a whole class and semester.
- **The entry window and edit limit** bind teachers only, so the office can enter late marks. An
  edit is a change to a mark that already had a value; `maxEdits` counts them per mark, and 0 means
  a mark cannot be changed once entered.
- **Edit log**: every save writes `ScoreEdit` rows (`source` MANUAL or IMPORT).
- **Monitoring** reads the teacher × class × subject pairs from the timetable; a student expects
  `regularCount + 2` marks per subject and semester. Exempt students are left out.
- **Exemptions** (`semester` 0 = the whole year): the gradebook shows MG and refuses marks for the
  student; results store the subject as exempt with no average and leave it out of the academic
  level and titles; when only one semester is exempt the year result uses the other one.
- **Visibility**: each part of the grades (TX marks, GK/CK, averages, levels, titles, absences,
  homeroom comment, teacher notes) can be hidden from families. `onlyAfterLock` publishes a
  semester only once the class gradebook is locked (the year needs both semesters). Hidden
  absences come back as `null`, not 0.

The portal page is *Sổ điểm › Quản lý sổ điểm*. Teachers see the locks, the window, exemptions
and their missing-marks list read-only; the office gets monitoring, the edit log and the rest.

## Excel round trip

The score sheet of a class, subject and semester downloads from the gradebook (*Xuất bảng điểm ›
Excel*) as the `subject-scores` report, whose flat header (STT, Mã HS, Họ và tên, TX1…, GK, CK,
ĐTBmhk, Ghi chú) is also the import format.

`POST /grades/book/import?classId=&subjectId=&semester=&dryRun=true` takes the file as multipart
`file` (.xlsx, up to 5 MB). It finds the header row by "Mã HS", matches students by code, accepts
decimal commas and Đ / CĐ for comment subjects, keeps marks whose cell is blank, and stops at the
first row without a code. The answer is `{ students, marks, changes, errors: [{ row, message }],
saved }`; nothing is saved on a dry run or when any row has an error. A real import goes through
the same checks as typing (locks, window, edit limit, exemptions) and logs its edits as IMPORT.

## Demo data

The seed sets the demo letterhead (UBND quận Cầu Giấy, principal Nguyễn Thị Hồng Hạnh, Hà Nội),
entry windows for both semesters with 3 edits allowed, a GK lock on grade 6 maths, a year-long PE
exemption for Phạm Gia Anh (6A1), four logged edits, and five missing 6A1 marks so monitoring has
work to show. A demo database seeded before this phase gets the same data on its next start,
except the missing marks, because the top-up never deletes anything.

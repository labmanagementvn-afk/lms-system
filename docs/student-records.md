# Student records: hồ sơ, biến động, khen thưởng và kỷ luật, đơn xin nghỉ học

Phase 9 adds what SMAS and K12Online keep about each student and this system did not: the full
record the sổ đăng bộ and CSDL ngành ask for, the year's movements with their papers,
commendation and discipline under Thông tư 19/2025/TT-BGDĐT, and leave requests sent by parents
and decided by the homeroom teacher.

## Hồ sơ học sinh

The student form (*Học sinh › Hồ sơ học sinh*) has four tabs:

- **Lý lịch**: mã học sinh, name, sex, date of birth, class, mã định danh (the 12 digits of the CCCD
  or VNeID number), the CSDL ngành code, nationality, dân tộc, tôn giáo, Đội viên and Đoàn viên,
  nơi sinh, quê quán and the diện chính sách (con liệt sĩ, con thương binh, hộ nghèo, hộ cận nghèo,
  vùng đặc biệt khó khăn, khuyết tật, mồ côi).
- **Địa chỉ**: chỗ ở hiện nay and nơi thường trú, each as house and street, ward or commune, and
  province, since local government has had two levels since 1/7/2025.
- **Gia đình**: each parent or guardian with year of birth, occupation, CCCD number, phone, email
  and who the school contacts first. A guardian kept on the form keeps its parent account.
- **Nhập trường** (new students only): tuyển mới or chuyển đến, the date and the school the
  student comes from. This writes the first line of the student's movements.

The list filters by class, status and diện chính sách, and selects students for bulk actions.
Each name opens the student's page (`/students/<id>`): the record, family, school years with
results, movements, commendation, discipline, attendance with leave requests, and exemptions, with
the actions of the next sections and the học bạ.

The CSDL ngành exchange file of phase 5 gains *Mã định danh*, *Dân tộc*, *Nơi sinh* and *Quê quán*,
and the student import reads them back; a mã định danh that is not 12 digits is refused on its line.

## Biến động học sinh

Every change of a student's place in the school is a movement, dated and kept:

| Movement | When | What changes |
| --- | --- | --- |
| Tuyển mới | a new student is added as tuyển mới, or an admission is enrolled | the student is placed in the class |
| Chuyển đến | a new student is added as chuyển đến, with the school they come from | the student is placed in the class |
| Chuyển lớp | *Chuyển lớp*, or a new class on the form | the year's enrolment, marks, results, conduct, summer review and completion records and the leave requests still to come follow the student; roll calls stay with the class they were taken in. Only to a class of the same grade. |
| Chuyển đi | *Chuyển trường*, with the school, the reason and the letter number | status *Chuyển trường*, the student's login stops, waiting leave requests are withdrawn |
| Thôi học | *Thôi học*, with the reason | status *Thôi học*, the same |
| Trở lại học | *Tiếp nhận trở lại*, into a class | status *Đang học* and the login works again |

A student leaves or comes back only through these actions: the form does not set *Chuyển trường* or
*Thôi học*, so the sổ đăng bộ always has the date and the reason. *Học sinh › Biến động học sinh*
lists the movements of a period with how many came, left and changed class. Admin and staff move
students; teachers read the list.

## Khen thưởng và kỷ luật

*Học sinh › Khen thưởng, kỷ luật* and the student's page record both under Thông tư 19/2025/TT-BGDĐT
(in force from 31/10/2025). Parents are told of each one in the app.

**Khen thưởng.** Tuyên dương trước lớp and thư khen are given by teachers; tuyên dương trước toàn
trường, giấy khen của Hiệu trưởng and other awards (from the ward, the Sở, a competition, with the
issuer and decision number) are entered by the office.

**Kỷ luật.** Each violation has a level (Điều 12): 1 harms the student, 2 the group or class,
3 the school. The measures (Điều 13) are checked when recorded:

| Measure | Students | Allowed when (Điều 14, 15) |
| --- | --- | --- |
| Nhắc nhở | all | always |
| Yêu cầu xin lỗi | primary (grades 1 to 5) | a repeat after a reminder, or level 2 or 3 |
| Phê bình | secondary | a repeat after a reminder, or level 2 or 3 |
| Yêu cầu viết bản tự kiểm điểm | secondary | level 2 after criticism, or level 3 |

The principal and the homeroom teacher take every measure; other teachers and staff only a
reminder or an apology (Điều 17). A self-review needs the family's confirmation (Điều 15): the
parent confirms it in the app, or the homeroom teacher records it. Support activities (Điều 16)
are noted with each measure. A record is deleted by the person who wrote it or the principal.

## Đơn xin nghỉ học

- **Parents** ask in the app (*Xin nghỉ học*) for whole days or one session, up to 30 days per
  request and from a week back at the earliest, and withdraw a request while it waits. The
  homeroom teacher gets a notification.
- **The homeroom teacher** approves or declines in *Điểm danh › Đơn xin nghỉ học* with a note to the
  family, and writes down requests made by phone or on paper, which are approved as they are
  recorded. Teachers see their own homeroom classes; admin and staff see every class.
- **The roll call.** Approving a request turns the days already marked absent into *có phép*,
  with the note "Có đơn xin nghỉ: …". On a later day, *Điền từ dữ liệu cổng* marks a student with
  an approved request who did not come through the gate as *có phép*, and the roll-call sheet tags
  every student with a request for the day, waiting or approved. No absence alert goes to the
  family for a day their request covers, even while it waits. The roll call is daily, so a
  half-day request covers its whole day.
- A request moves with the student on a class change and is withdrawn when the student leaves.

## Báo cáo

| Report | Group | Who |
| --- | --- | --- |
| `student-register` Sổ đăng bộ học sinh: identity, parents, class, entry and exit with their reason | Hồ sơ học sinh | portal |
| `student-movements` Danh sách biến động học sinh, with the totals by kind | Hồ sơ học sinh | portal |
| `transfer-letter` Giấy giới thiệu chuyển trường, for a student recorded as chuyển đi | Hồ sơ học sinh | admin, staff |
| `policy-students` Danh sách học sinh diện chính sách | Hồ sơ học sinh | portal |
| `student-awards` Danh sách học sinh được khen thưởng | Khen thưởng, kỷ luật | portal |
| `student-discipline` Danh sách học sinh vi phạm và biện pháp kỷ luật | Khen thưởng, kỷ luật | admin, staff |

The transfer letter also prints from the student's page, and *Danh sách học sinh chuyển trường /
thôi học* now shows the date of each departure with the school the student went to or the reason
they left.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `GET /students/:id/profile` | portal | the whole record |
| `GET /students/movements?from=&to=&kind=&classId=&studentId=` | portal | movements |
| `POST /students/move-class`, `/transfer-out`, `/drop-out` | admin, staff | `{ studentIds, date?, ... }` |
| `POST /students/:id/readmit` | admin, staff | `{ classId, date?, reason? }` |
| `GET /students/awards`, `POST`, `DELETE /:id` | portal | commendation |
| `GET /students/discipline`, `POST`, `PATCH /:id`, `DELETE /:id` | portal | discipline, support, family confirmation |
| `GET /homeroom/absences?classId=&status=&from=&to=` | portal | leave requests |
| `POST /homeroom/absences` | homeroom teacher, admin, staff | a request made by phone, approved |
| `POST /homeroom/absences/:id/decide` | homeroom teacher, admin, staff | `{ approve, note? }` |
| `GET /parent/children/:id/absences`, `POST` | parent | the child's requests; a new one |
| `POST /parent/absences/:id/cancel` | parent | withdraws a waiting request |
| `GET /parent/children/:id/merits` | parent | the year's commendation and discipline |
| `POST /parent/discipline/:id/confirm` | parent | confirms a self-review |

## Demo data

The seed fills in every demo student's record and family (with mothers, a few students in a diện
chính sách and two from ethnic minorities), the grade 6 intake and earlier entries, a transfer in,
a class change from 6A2 to 6A1, a student who dropped out and came back, a transfer out from 7A1
with its letter, commendations and discipline that follow the circular's steps, and leave requests
in 6A1: approved ones behind the "có phép" roll calls, one declined, one withdrawn and two waiting
for GV001. The demo parent (`0981000000`) has one of the waiting requests and a self-review to
confirm.

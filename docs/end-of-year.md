# End of the school year

Phase 7 covers what happens after the year's marks are locked: the summer review that decides who
goes up (kiểm tra lại, rèn luyện trong hè), award certificates, and the recognition of grade 9
students as having completed lower secondary school, which replaced the THCS diploma in 2026.

## Promotion (Thông tư 22/2021)

`recomputeResults` stores on each year `TermResult`:

- **Rèn luyện cả năm** from the two semesters (Điều 8), the second weighing more.
- **Kết quả học tập** from the year results of every subject (Điều 9).
- **Promotion** (Điều 12): more than 45 sessions absent, or learning and conduct both at Chưa
  đạt, means `RETAINED`. Exactly one of them at Chưa đạt means `RETEST` until the summer review
  re-rates it; the student is then `PROMOTED` at Đạt or better and `RETAINED` otherwise.
- `academicAfterRetake` once every registered retake has a result, and `conductAfterTraining`
  once summer training is evaluated.

The office or the homeroom teacher can set promotion by hand for the year
(`PUT /grades/results/:studentId` with `promotion`); `null` clears it so the computed value
applies again. A value set by hand always wins
and is marked with a pencil on *Kết quả học tập*.

## Retakes (kiểm tra lại, Điều 14)

| Route | Who | What |
| --- | --- | --- |
| `GET /grades/review/retakes` | portal | students who must or may retake, with their subjects and results |
| `POST /grades/review/retakes/register` | admin, staff | registers every eligible subject for listed students with none yet |
| `PUT /grades/review/retakes/:studentId` | admin, staff | the subjects one student retakes (subjects with a result stay) |
| `PUT /grades/review/retakes/results` | portal | results; a teacher only for the subjects they teach |

A student is listed when learning failed while conduct and absences allow promotion, or, in grade
9, when a comment subject is at Chưa đạt (it holds back the completion review). The subjects that
can be retaken are the comment subjects at Chưa đạt and the score subjects with a year average
under 5.0. A retake's result replaces the subject's year result for the re-rating.

## Summer training (rèn luyện trong hè, Điều 13)

| Route | Who | What |
| --- | --- | --- |
| `GET /grades/review/training` | portal | students whose year conduct is Chưa đạt |
| `PUT /grades/review/training/:studentId` | the homeroom teacher, admin, staff | tasks, then the re-evaluated conduct and a comment |
| `DELETE /grades/review/training/:studentId` | admin, staff | removes a training |

The re-evaluation decides promotion only when learning is Đạt or better and absences are 45 or
fewer; otherwise the student stays down whatever the result.

`GET /grades/review/promotion` counts each class (promoted, after the review, waiting, retained)
and lists who was not promoted outright, with the reason.

## THCS completion (xét công nhận hoàn thành chương trình THCS)

Luật số 123/2025/QH15, amending the Education Law, abolished the THCS diploma. A council now
recognises grade 9 students who completed the programme, in a first round before the school year
ends and a second one after the summer, and the principal confirms it in the học bạ.

A student can be recognised when conduct and learning (after the summer review) are Đạt or better,
no subject is at Chưa đạt, absences are 45 or fewer, they are at most 21 by year of birth, and the
dossier is complete. A promotion set by hand stands in for the result conditions when it is
`PROMOTED` and blocks recognition otherwise.

| Route | Who | What |
| --- | --- | --- |
| `GET /grades/completion?round=&classId=` | portal | every grade 9 student against the conditions, both rounds' state |
| `PUT /grades/completion/rounds/:round` | admin, staff | the council: decision setting it up, meeting time and place, members |
| `PUT /grades/completion/students/:studentId` | admin, staff | dossier complete, priority group, note |
| `POST /grades/completion/rounds/:round/recognize` | admin | the decision: number, date, signer |
| `DELETE /grades/completion/rounds/:round/recognize` | admin | withdraws the latest round's decision |

- Round 2 starts from round 1's council and can only be decided after round 1.
- Recognising a round gives every eligible student the round and the next number in the
  register, by class and then name. Numbers continue from round 1 into round 2.
- The decision also keeps who it left out and why, as they stood that day. The lists and minutes
  of a decided round are printed from it, so a retake passed in the summer does not rewrite
  round 1's papers.
- Only the latest decision can be withdrawn; the students go back on the list and lose their
  numbers.

## Documents

All are in *Báo cáo* and on the review pages, as a preview, PDF or Excel.

| Group | Key | Document | Parameters (required in bold) |
| --- | --- | --- | --- |
| Cuối năm học | `retakes` | Danh sách và kết quả kiểm tra lại | gradeLevel, classId |
| | `summer-training` | Danh sách học sinh rèn luyện trong hè | gradeLevel, classId |
| | `award-certificates` | Giấy khen học sinh Xuất sắc, Giỏi (list, then one certificate per page) | gradeLevel, classId |
| Hoàn thành chương trình THCS | `completion-proposed` | Danh sách 1: đề nghị (or, once decided, được) công nhận | **round** |
| | `completion-not-eligible` | Danh sách 2: chưa đủ điều kiện, with the reasons | **round** |
| | `completion-minutes` | Biên bản họp Hội đồng | **round** |
| | `completion-decision` | Quyết định công nhận, with the list attached | **round** |
| | `completion-certificates` | Giấy xác nhận hoàn thành, one per student | classId, studentId |

The học bạ shows the retake results, the summer training and its re-evaluation, and, once a student
is recognised, "Xác nhận của Hiệu trưởng: Học sinh đã hoàn thành chương trình giáo dục trung học cơ
sở" with the decision and register number.

## Portal

- *Sổ điểm › Kiểm tra lại & rèn luyện hè*: retakes (register, choose subjects, enter results),
  summer training (tasks and re-evaluation) and the promotion after the review, filtered by grade
  or class.
- *Sổ điểm › Xét hoàn thành THCS*: round 1 or 2, the council, the decision, the papers and every
  grade 9 student with what is missing.
- *Kết quả học tập* (year view) shows the results after the review and links to the review page.

## Demo data

Class 9A1 (homeroom Phạm Quốc Bảo) has its whole year marked, conduct approved and both semesters
locked, with a student in every situation:

| Student | Situation |
| --- | --- |
| Nguyễn Minh Khôi | Học sinh Xuất sắc; recognised in round 1 |
| Trần Bảo Ngọc, Lê Gia Hân | Học sinh Giỏi; recognised in round 1 |
| Hoàng Thu Trang, Vũ Quang Huy, Đặng Khánh Linh | recognised in round 1 (Trang: con thương binh) |
| Phạm Đức Thịnh | eligible but the dossier lacks a birth certificate copy |
| Bùi Tuấn Kiệt | promoted, but Nghệ thuật at Chưa đạt holds back completion |
| Đỗ Hải Đăng | learning Chưa đạt; passed three retakes, so promoted and eligible for round 2 |
| Ngô Phương Thảo | learning Chưa đạt; three retakes registered, no results yet |
| Dương Văn Toàn | conduct Chưa đạt; summer training set, not evaluated yet |
| Lý Thanh Tâm | 48 sessions absent: stays down |

Round 1 was decided on 25/05/2027 (Quyết định 25/QĐ-HĐXCN); round 2's council meets on
10/08/2027 and has no decision yet. A demo seeded before this phase gets the class on its next
start.

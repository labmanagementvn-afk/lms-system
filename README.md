# LMS System: school management

K-12 school platform with a Vietnamese web portal.

- **Phase 1**: teachers, students, classes, timetable and gate attendance (điểm danh ra vào trường with fingerprint / face / card terminals).
- **Phase 2**: finance and student services: tuition with VietQR payments and MISA sync, store/issuance with inventory, canteen, library, school health.
- **Phase 3**: parent and driver apps, notifications, homeroom attendance and logbook, announcements, school bus, admissions, HR, assets.
- **Phase 4**: student accounts, gradebook (Thông tư 22) with transcripts, conduct scoring, e-learning (courses, question bank, tests, contests, live classes).
- **Phase 5**: district (Phòng/Sở GD&ĐT) accounts and dashboards, nightly statistics with alert rules, MOET education-database exchange files, audit log, API hardening.
- **Phase 6**: official reports as PDF and Excel, gradebook control (column locks, entry window, edit log, monitoring, exemptions, what families see) and Excel import of score sheets.

| Part | Stack | Folder |
|---|---|---|
| API | NestJS 11, Prisma 6, PostgreSQL 16, JWT auth, OpenAPI | `apps/api` |
| Web portal | Next.js 15, React 19, Ant Design 5 (Vietnamese locale) | `apps/web` |

Every tenant-owned row carries `schoolId`, so several schools can share one deployment.

## Run locally

Requirements: Node 20+, pnpm 10, Docker (or a local Postgres 16).

```bash
pnpm install
docker compose up -d postgres

cd apps/api
cp .env.example .env
pnpm prisma:migrate     # creates tables
pnpm seed               # demo school; prints a device API key
pnpm start:dev          # http://localhost:4000, docs at /api/docs

cd ../web
cp .env.example .env.local
pnpm dev                # http://localhost:3000
```

To put a demo online (Render, or your own computer with a temporary Cloudflare link), see [docs/demo-deploy.md](docs/demo-deploy.md).

Demo logins (from the seed): `admin@demo.edu.vn / Admin@123` (quản trị), `baove@demo.edu.vn / Staff@123` (nhân viên), `gv001@demo.edu.vn / Teacher@123` (giáo viên). Phase 3 adds a parent login (`0981000000 / Parent@123`, two children) and a driver login (`0912000001 / Driver@123`); phase 4 a student login (`hs2026001 / Student@123`); phase 5 a district officer (`pgd@caugiay.edu.vn / District@123`) and a second school (`admin@demo2.edu.vn / Admin@123`). The seed prints them.

## Features

- **Giáo viên**: profiles, subjects taught, status, optional login account.
- **Học sinh**: profiles, parents/guardians, status (đang học, chuyển trường, thôi học, tốt nghiệp), class.
- **Lớp học**: per academic year and grade, homeroom teacher, room, enrolment (one class per student per year).
- **Thời khóa biểu**: bell schedule (tiết), timetable per class and per teacher, semester 1/2. Double-booking a class, teacher or room is rejected.
- **Điểm danh ra vào**: device-agnostic ingestion API, ZKTeco ADMS push, manual entry, daily report (đúng giờ / đi muộn / vắng), unmatched-scan log, biometric consent tracking. See [docs/attendance-devices.md](docs/attendance-devices.md).

### Phase 2

- **Học phí**: fee items, per-student discounts, billing campaigns that issue invoices per student with carried-over debt, cash receipts, VietQR codes per invoice, bank-webhook auto matching, manual reconciliation, receipt voiding, collection summary per class. See [docs/finance-integrations.md](docs/finance-integrations.md).
- **Đồng bộ MISA**: every receipt and stock movement goes through an outbox with retries; ships with a sandbox adapter only.
- **Cấp phát**: uniforms, books and equipment with stock in/adjust, orders billed to students as invoices, issuing decrements stock.
- **Bán trú**: daily menus with a registration cutoff, register/cancel meals per class, daily counts per class, monthly cost per student.
- **Thư viện**: catalogue and copies by barcode, borrow/return/renew, loan limits, reservations, overdue list.
- **Y tế học đường**: health profile and BHYT number, check-ups with BMI, vaccinations, incidents, expiring-insurance list. Restricted to admin and staff.

Payment and accounting integrations run against **sandbox implementations**; no real gateway or MISA credentials are configured.

### Phase 3

- **Ứng dụng phụ huynh** (`/parent`, phone-sized): one login per guardian phone, children switcher, today's gate status, monthly attendance, fees with VietQR, meal registration, health record, bus tracking, service registration, announcements with RSVP, live notifications. Accounts are created by the school from guardian records (*Tài khoản phụ huynh*), with first-login password change.
- **Thông báo**: in-app inbox and server-sent events for everyone, plus an outbox for push / Zalo ZNS / SMS / email behind channel adapters (sandbox only), with retries and a delivery log. Alerts fire from gate scans, homeroom attendance, invoices, payments, health incidents, bus boarding and leave decisions. See [docs/notifications.md](docs/notifications.md).
- **Điểm danh lớp & sổ đầu bài**: homeroom teachers mark the class in one tap, prefilled from the gate terminals; absences alert parents. Lesson logbook per timetable slot with content, rating, absentees and class statistics.
- **Thông báo & sự kiện**: announcements and events to roles, classes or grades, scheduled or sent now, with read and RSVP statistics.
- **Xe đưa đón**: vehicles with inspection/insurance expiry, drivers and monitors with a driver login, routes with ordered stops and student assignments, daily trips, a driver app (`/driver`) that starts the trip, streams GPS and records boarding/alighting (parents are notified), a live map for the school and the bus position in the parent app.
- **Tuyển sinh & dịch vụ**: admission rounds, a public application form (`/apply/<school code>`) with status lookup, CSV import/export, screening, enrolment that creates the student, guardian and class placement; yearly service registration (canteen, bus, uniform, clubs) submitted by parents and confirmed by the school.
- **Nhân sự**: employee records linked to teacher accounts, documents and contracts with expiry alerts, work history, leave requests with approval (employee is notified), self-service for staff and teachers.
- **Tài sản**: categories, suppliers, assets with straight-line depreciation and book value, maintenance, lending, disposal and stocktakes with a missing-items report.

### Phase 4

- **Tài khoản học sinh**: one login per student (username = student code) created by the school with a one-time password sheet; a student app at `/student`.
- **Sổ điểm (Thông tư 22)**: subjects assessed by score or by comment, regular / mid-term / end-of-term marks per semester, automatic averages, academic level, titles and promotion, class locks, CSV export, a printable học bạ; marks appear in the student and parent apps with an alert on each mid-term or end-of-term mark.
- **Rèn luyện**: school-defined criteria, student self-assessment, homeroom review, leadership approval and the resulting level feeding the gradebook.
- **E-learning**: courses with sections and lessons (video, document, SCORM, H5P, text, link, quiz), auto-enrolment by class, progress tracking, discussions, live classes on Jitsi Meet, learning reports; a question bank (9 types, 6 levels, CSV import/export), tests, exams and school-wide contests with auto-grading, manual essay grading, leaderboards and statistics. Uploads are stored on local disk (`UPLOAD_DIR`). See [docs/learning.md](docs/learning.md).

### Phase 5

- **Cổng Phòng/Sở GD&ĐT** (`/district`): officers log in by email and see every school attached to their district: daily totals, a 14-day trend, one line per school (attendance, late, absent, overdue fees, open alerts), school detail pages, district-wide alert rules, the audit trail of all schools and officer account management. A school attaches itself in *Thiết lập › Trường học* with its MOET code.
- **Thống kê ngày**: a scheduler computes one row per school and day (attendance from the gate, homeroom absences, invoices, revenue, overdue fees, health incidents, e-learning activity) and refreshes today's row through the day; the school dashboard shows 14-day charts.
- **Cảnh báo**: threshold rules per school or per district (attendance below, late rate above, overdue fees above, health incidents above, absence streaks) evaluated nightly, one event per rule and day, notifying admins and district officers; events are acknowledged in the portal.
- **Dữ liệu CSDL ngành**: exports in the ministry template (students, teachers, classes, term results) kept in a history with downloads, and a student-list import in the same template with a dry run.
- **Nhật ký hệ thống**: every state-changing API call recorded with user, module, outcome and a redacted body; failed sign-ins included; retention via `AUDIT_RETENTION_DAYS`.
- **Hardening**: security headers (helmet), per-IP rate limiting with a stricter login limit, a JSON body limit, `GET /healthz`. See [docs/platform.md](docs/platform.md).

### Phase 6

- **Báo cáo**: 15 official reports (class lists, transfers, absences, exemptions, score sheets, class summaries, score distribution, level statistics, awards, retests, học bạ, entry monitoring, missing marks, edit log) previewed in the portal and downloaded as PDF or Excel with the school letterhead, national motto and signer block.
- **Quản lý sổ điểm**: per-column locks by grade and subject, an entry window and edit limit for teachers, an edit log, entry monitoring per teacher with the list of missing marks, subject exemptions (miễn học) carried through results and reports, and settings for what parents and students see, including publishing marks only after the class gradebook is locked.
- **Excel**: the score sheet downloads as Excel and imports back with a check first that lists every change and bad row. See [docs/reports-gradebook-control.md](docs/reports-gradebook-control.md).

Roles: `ADMIN` manages everything; `STAFF` manages students, enrolment, identities and manual attendance; `TEACHER` reads and records manual attendance. Finance, store and health are admin/staff only; teachers can register canteen meals and use the library. `PARENT`, `DRIVER` and `STUDENT` only reach the parent, driver and student apps; `DISTRICT` only reaches the district portal.

## Tests

```bash
cd apps/api
pnpm test               # unit tests
pnpm test:e2e           # API tests against DATABASE_URL (use a separate database)
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit and e2e tests against Postgres, the seed, and both builds.

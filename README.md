# LMS System: school management

K-12 school platform with a Vietnamese web portal.

- **Phase 1**: teachers, students, classes, timetable and gate attendance (điểm danh ra vào trường with fingerprint / face / card terminals).
- **Phase 2**: finance and student services: tuition with VietQR payments and MISA sync, store/issuance with inventory, canteen, library, school health.

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

Demo logins (from the seed): `admin@demo.edu.vn / Admin@123` (quản trị), `baove@demo.edu.vn / Staff@123` (nhân viên), `gv001@demo.edu.vn / Teacher@123` (giáo viên).

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

Roles: `ADMIN` manages everything; `STAFF` manages students, enrolment, identities and manual attendance; `TEACHER` reads and records manual attendance. Finance, store and health are admin/staff only; teachers can register canteen meals and use the library.

## Tests

```bash
cd apps/api
pnpm test               # unit tests
pnpm test:e2e           # API tests against DATABASE_URL (use a separate database)
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit and e2e tests against Postgres, the seed, and both builds.

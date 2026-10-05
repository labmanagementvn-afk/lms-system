# District level, daily statistics, alerts, MOET exchange, audit log and hardening

Phase 5 lifts the platform above one school: a Phòng/Sở GD&ĐT (district or provincial education
authority) sees every school that reports to it, a nightly job turns the operational tables into
one statistics row per school and day, threshold rules raise alerts on those rows, every change is
written to an audit log, the MOET education database (CSDL ngành) gets its exchange files, and the
API gains the usual production hardening.

## District accounts

| Role | Logs in with | Sees |
| --- | --- | --- |
| `DISTRICT` | email | the district portal (`/district`): every school attached to their district |

A `District` (`code`, `name`, `level` PHONG or SO, `province`) owns `User` rows of role `DISTRICT`
(`districtId` set, `schoolId` null) and the schools whose `School.districtId` points at it. A school
attaches itself in *Thiết lập › Trường học* (`PATCH /school` with `districtId`, plus its
`moetCode` in the MOET database and `province`); `GET /districts` lists the authorities.

`AuthUser.schoolId` is the empty string for district officers and `districtId` carries their
district; the JWT holds both. Routes without `@Roles` stay school-portal only, so an officer's
token is rejected everywhere except the `@Roles(Role.DISTRICT)` routes under `/district`:

| Route | What it returns |
| --- | --- |
| `GET /district/overview?date=` | totals for the day (students, teachers, classes, attendance, overdue fees, open alerts) and one line per school |
| `GET /district/trend?days=` | per-day aggregate across the district's schools |
| `GET /district/schools/:id?days=` | one school: profile, admin contacts, classes, the window's statistics and its alerts |
| `GET /district/alerts`, `POST /district/alerts/:id/ack` | alert events across the district |
| `GET/POST/PATCH/DELETE /district/rules` | district-wide alert rules (applied to every attached school) |
| `GET /district/audit` | the audit trail of the district's schools and officers |
| `GET/POST/PATCH /district/users` | officer accounts (create colleagues, reset passwords, deactivate) |

`DistrictService.scope(user)` resolves the officer's district and school ids and every route goes
through it, so a school that is not attached is a 404, never a leak. The web portal lives under
`apps/web/src/app/(district)/district` (overview, schools, alerts, audit log, officer accounts).
Officers have no school, so `AuthProvider` fills `me.school` with a placeholder (timezone
Asia/Ho_Chi_Minh) and the shared components keep working.

## Daily statistics (Thống kê ngày)

`DailyStat` holds one row per school and local day (`@@unique([schoolId, date])`), computed by
`DailyStatsService.computeDay` from the operational tables:

| Column | Source |
| --- | --- |
| `students` | students with status `STUDYING` |
| `present`, `late`, `absent`, `attendanceRate` | gate events of the day summarised per student with `summarizeDay` (same rule as the attendance report); rate = present / students, one decimal. A day without a single gate event (Sunday, holiday, device outage) has `absent` 0 and the API reports the rate as `null`, so charts break the line and window averages skip the day |
| `homeroomAbsent` | homeroom roll-call rows marked ABSENT or EXCUSED |
| `invoicesIssued`, `invoicesPaid`, `revenue` | invoices issued in the day, invoices that became PAID through a payment of the day, confirmed payments of the day (VND) |
| `overdueAmount` | unpaid balance of UNPAID/PARTIAL invoices whose due date is before the day |
| `healthIncidents` | incidents that occurred in the day |
| `lmsActiveStudents`, `testsSubmitted` | distinct students with lesson progress in the day, test attempts handed in |

Days are the school's local calendar days (`zonedDayRange`). `StatsScheduler` runs every
`STATS_SCHEDULER_MS` (default 15 minutes, `0` disables): each tick refreshes today's row for every
school, and once per local day it finalises yesterday's row, evaluates the alert rules on it and
purges audit rows older than `AUDIT_RETENTION_DAYS`. Admins can recompute a range after fixing
data (`POST /stats/recompute {from, to}`, at most 62 days); `GET /stats/daily` and
`GET /stats/summary?days=` feed the school dashboard (14-day charts on *Tổng quan*).

## Alert rules (Cảnh báo)

`AlertRule` belongs to a school (`schoolId`) or to a district (`districtId`, applied to every
attached school). `AlertKind` and the pure evaluation in `apps/api/src/stats/alert-rules.ts`:

| Kind | Fires when | Value |
| --- | --- | --- |
| `ATTENDANCE_RATE_BELOW` | attendance rate < threshold (%) and the school has gate data that day | rate |
| `LATE_RATE_ABOVE` | late / students × 100 > threshold (%) | late rate |
| `OVERDUE_FEES_ABOVE` | overdue amount > threshold (VND) | amount |
| `HEALTH_INCIDENTS_ABOVE` | incidents of the day > threshold | count |
| `ABSENT_STREAK` | at least one student with no gate event (and no PRESENT/LATE roll call) on each of the last `threshold` school days (Monday–Saturday) | number of students, names in the message |

`AlertRulesService.evaluate(schoolId, date)` creates at most one `AlertEvent` per rule, school and
day (`@@unique([ruleId, schoolId, date])`); a rule that fires again the same day only refreshes
the value. A new event notifies the school's admins and the district's officers (`NotificationKind.ALERT`,
through the phase 3 outbox). Events are acknowledged by admin/staff (`POST /alerts/events/:id/ack`)
or by the district (`POST /district/alerts/:id/ack`). `POST /alerts/evaluate {date?}` runs the check
on demand; the portal page is *Thiết lập › Cảnh báo*.

## Audit log (Nhật ký hệ thống)

`AuditInterceptor` is a global interceptor: every `POST`, `PUT`, `PATCH` and `DELETE` is written to
`AuditLog` after the handler finishes, with the user (school, district, role), method, path, module
(`area`, the first path segment after `/api/v1`), status code (also for thrown exceptions, mapped
like `PrismaExceptionFilter`), client IP, user agent, duration and the request body. Bodies go
through `redact()`: keys matching password / secret / token / api key / otp / pin / credential are
replaced with `[đã ẩn]`, long strings are cut, and bodies over 4 KB keep only a preview. Terminal
pushes (`/iclock`, `/attendance/ingest`), payment webhooks, bus GPS pings and the health probe are
not logged. Failed sign-ins are attributed to the school (or district) of the account they named,
so an admin sees attempts against their users. Writes are fire-and-forget: a failed audit insert
is logged, never surfaced to the caller.

`GET /audit` (ADMIN) lists the school's rows with filters (user, area, method, role, failed only,
date range, path search); `GET /district/audit` does the same across a district. Rows older than
`AUDIT_RETENTION_DAYS` (default 180, `0` keeps everything) are purged by the stats scheduler.

## MOET exchange (CSDL ngành GDĐT)

`MoetService` builds the exchange files in the layout of the ministry's import templates
(`apps/api/src/moet/moet-csv.ts`, Vietnamese headers, `dd/mm/yyyy` dates, Vietnamese enum labels,
UTF-8 with BOM and semicolons so Excel opens them as columns). The school's `moetCode` fills the
*Mã trường* column.

| Kind | Rows |
| --- | --- |
| `STUDENTS` | every student with grade and class of the chosen year, status and primary guardian |
| `TEACHERS` | every teacher with contact, status and subjects taught |
| `CLASSES` | classes of the year with homeroom teacher and size |
| `TERM_RESULTS` | semester outcomes (academic and conduct level, title, promotion, absent days) plus one *Điểm TB* column per subject |

`POST /moet/exports {kind, academicYearId?, semester?}` stores the file through `UploadsService`
(`StoredFile`) and records a `MoetExport` row (`DONE` with row count, or `FAILED` with the error);
`GET /moet/exports` is the history and `GET /moet/exports/:id/download` streams the file (accepts
`?access_token=` so a plain link works). The reverse direction, `POST /moet/import/students
{csv, dryRun?}`, reads a student list in the same template (columns matched by meaning, so order
and ASCII aliases both work), upserts students by code, enrols them in the class of the same name
in the current year, adds the guardian when the student has none, and returns counts and per-line
errors; `dryRun` validates without writing. The page is *Thiết lập › Dữ liệu CSDL ngành*.

Uploading to the authority's portal or API is outside this system: the file is what the operator
submits.

## Hardening

- **Security headers**: `helmet` in `configureApp` (CSP off for Swagger UI and SCORM packages;
  frames and cross-origin resources allowed because the web app embeds files served by the API).
- **Rate limiting**: `@nestjs/throttler` as a global guard, `RATE_LIMIT_PER_MIN` requests per
  minute per client IP (default 300, `0` disables, which the tests use) and a stricter
  `AUTH_RATE_LIMIT_PER_MIN` (default 10) on `POST /auth/login`. Set `TRUST_PROXY` (Express's
  *trust proxy* value, e.g. `1`) behind a reverse proxy so the client IP comes from
  `X-Forwarded-For`.
- **Body limit**: `JSON_BODY_LIMIT` (default `10mb`) replaces Nest's 100 kB default so CSV imports
  posted as JSON fit.
- **Health probe**: `GET /healthz` (no prefix, no token, never throttled) returns 200 with the
  database round-trip time, or 503 when the database is unreachable.

## Demo data

The seed creates *Phòng GD&ĐT Quận Cầu Giấy* with the demo school and a second school
(`DEMO2`, `admin@demo2.edu.vn / Admin@123`), two weeks of gate traffic for both, their daily
statistics, five alert rules with the events they raised (older ones acknowledged) and a few audit
rows. District login: `pgd@caugiay.edu.vn / District@123`.

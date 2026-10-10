# SMS, direct sync with the education database, and signed học bạ

Phase 8 adds three things other school systems (SMAS, K12Online) offer that this one did not: texts
to parents and teachers under the school's brandname, records submitted straight to CSDL ngành or
the Sở's database instead of uploading exchange files by hand, and the học bạ số, signed digitally
by the homeroom teacher and the principal.

All three reach outside services through adapters, and **only sandbox adapters exist**. Never put
real credentials in a demo or test deployment: a real SMS gateway reaches real phones, a real
database account changes official records, and a real signing account makes legally binding
signatures. The demo seed always uses the sandboxes, whatever the environment says.

## Tin nhắn SMS

Texts go out through the SMS channel adapter of the notifications module
([notifications.md](notifications.md)), so `NOTIFY_PROVIDERS` picks the gateway; `SMS=mock` is the
sandbox, which sends nothing and fails any text containing `[mock-fail]`.

- **Wording.** A text is sent without diacritics (160 characters per SMS, 153 each when split) unless
  the sender ticks *Gửi có dấu* (70, or 67 each). The longest text allowed is 4 SMS. Placeholders are
  filled per recipient: `{hoc_sinh}`, `{ma_hs}`, `{lop}`, `{phu_huynh}`, `{truong}`, `{ngay}` for
  parents and `{giao_vien}`, `{truong}`, `{ngay}` for teachers. Templates keep reusable texts.
- **Recipients.** Parents: one text per student still studying, to the primary guardian or else
  the first guardian with a valid phone; students with none are listed as skipped. Teachers: the
  whole staff (except those who resigned) or the ones picked, at the teacher's phone or their
  account's.
- **Who.** Admin and staff text any class and the teachers, and manage templates. A teacher texts
  only the parents of their homeroom classes and sees only their own texts.
- **Quotas.** Each class has a monthly quota for its parents (the school's default, 200, or its
  own), and texts to teachers draw on the school's pool (500). A text counts in the month it goes
  out, against the class of its student; sent and waiting texts count, failed ones do not. A send
  that would go over is refused with what is left. Sends of one school take a row lock on its
  `SmsSetting`, so two sends cannot both fit into the same remainder.
- **Scheduling.** A text can be set up to 90 days ahead and cancelled until it goes, which frees
  its quota. `SmsDispatcher` sends due texts every `NOTIFY_DISPATCH_INTERVAL_MS` with the outbox's
  retries (1, 2, 4, 8 minutes, 5 attempts); *Gửi lại* queues a campaign's failed texts again if the
  quota allows.

| Route | Who | What |
| --- | --- | --- |
| `GET /sms/settings`, `PUT /sms/settings` | portal; admin | brandname and default quotas, the gateway, placeholders, limits |
| `PUT /sms/quotas/:classId` | admin | a class's own monthly quota (`null` goes back to the default) |
| `GET /sms/usage?month=` | portal | each class's quota and use in a month (a teacher: their classes) |
| `GET /sms/templates`, `POST`, `PATCH /:id`, `DELETE /:id` | portal; admin, staff to change | templates |
| `POST /sms/preview` | portal | recipients, skipped, cost, three sample texts and the quota check |
| `POST /sms/campaigns` | portal | sends now or at `scheduledAt` |
| `GET /sms/campaigns`, `GET /sms/campaigns/:id/messages` | portal | history and each text's delivery |
| `POST /sms/campaigns/:id/cancel`, `/retry` | portal | calls off a scheduled text; retries failed ones |

The report `sms-usage` (*Thống kê tin nhắn SMS*, group Liên lạc, admin and staff) counts texts,
sent, failed, waiting and billed SMS per class and for the teachers between two dates.

## Đồng bộ CSDL ngành

Direct sync submits one kind of records (students, teachers, classes, term results), built exactly
like the exchange files of phase 5, to `MOET` (CSDL ngành of the ministry) or `PROVINCE` (the Sở's
database), signing in with the school's account on that database.

- The password is used for that one call: it is never stored, and the audit log shows it as
  `[đã ẩn]`. The account name is kept to fill in the form next time.
- Each submission is kept: `SUCCESS`, `PARTIAL` (some rows refused) or `FAILED` (sign-in refused,
  service down, or every row refused), the counts, the database's batch number and each refused
  row with its line, code, name and reason (the first 500).
- `MOET_SYNC_PROVIDER=mock` is the sandbox. It refuses passwords shorter than 6 characters (as a
  wrong password), accounts containing `mock-down` (as the service being down), and rows with a
  required column empty, such as teachers without a date of birth.

A real gateway needs API access granted by the ministry or the Sở: implement `MoetGateway` in
`apps/api/src/moet/moet-gateway.ts` and register it in `moetGatewayFactory`.

| Route | Who | What |
| --- | --- | --- |
| `POST /moet/sync` | admin, staff | `{ target, kind, academicYearId?, semester?, username, password }` |
| `GET /moet/sync?target=&kind=&status=` | admin, staff | history, the gateway in use, the last account names |
| `GET /moet/sync/:id` | admin, staff | one submission with its refused rows |

## Chữ ký số and học bạ số

**Signing accounts.** Each signer declares their remote signing account (ký số từ xa) in *Tài
khoản*: VNPT SmartCA or Viettel MySign, and the account the provider knows them by (CCCD number or
phone). The system looks up the account's certificate and keeps its serial, subject, issuer and
validity. It never asks for a password or PIN: the real services ask the signer to confirm each
signature in their phone app.

`ESIGN_PROVIDERS=VNPT_SMARTCA=mock,VIETTEL_MYSIGN=mock` is the sandbox. It derives a certificate
from the account (valid from 1 January for three years) and signs with an HMAC; an account
containing `mock-nocert` has no certificate and one containing `mock-fail` refuses to confirm.
Sandbox signatures have no legal value, and every page and PDF says so. A real provider implements
`SignatureAdapter` in `apps/api/src/esign/signature-provider.ts`.

**A học bạ số's life.**

1. *Tạo học bạ số cho lớp* (admin, staff or the homeroom teacher) freezes each student's học bạ for the
   year, as the report prints it, into a record: the content and the SHA-256 of its canonical
   JSON. The year's results must exist; a student with a record that is not revoked is skipped.
2. The homeroom teacher of the class signs the drafts, then the principal (an admin account) signs,
   which issues the record. Records are signed in batches, each succeeding or failing on its own.
3. Each signature covers the content hash and the signatures before it, like a countersignature,
   so neither the content nor an earlier signature can change unnoticed.
4. An admin can revoke a record with a reason; a new version can then be made and signed.
5. The PDF is the học bạ as frozen with a red stamp for each signature (signer, provider,
   certificate serial, time), the lookup code, the link to check it and the hash. Drafts and
   revoked records say so on the paper.
6. Anyone holding the paper can open `/verify/:id?code=` without logging in: it shows whether the
   record is issued, its content intact, and who signed it when. `PUBLIC_WEB_URL` sets the address
   printed on the PDF; without it, the portal's own address is used.

Not covered yet: the school's organisation certificate (used in place of the seal) and sending the
records to the ministry's học bạ số system.

| Route | Who | What |
| --- | --- | --- |
| `GET /esign/profile`, `PUT`, `DELETE` | admin, staff, teacher | the caller's signing account and the providers |
| `GET /erecords?classId=` | portal (a teacher: homeroom classes) | each student's latest record, counts, what the caller may sign |
| `POST /erecords/generate` | portal | `{ classId, studentIds? }` |
| `POST /erecords/sign` | homeroom teacher, admin | `{ ids }`: signs each at its next step |
| `GET /erecords/:id`, `GET /erecords/:id/pdf` | portal | content, check and versions; the PDF |
| `POST /erecords/:id/revoke` | admin | `{ reason }` |
| `GET /public/erecords/:id?code=` | anyone | what the check page shows |

## Portal

- *Tin nhắn SMS*: compose (template, placeholders, preview with cost and quota, schedule), history
  with each text's delivery, templates and the quotas per class.
- *Thiết lập › Dữ liệu CSDL ngành*: *Đồng bộ trực tiếp* (the form and the history with refused
  rows), then the exchange files and the student import of phase 5.
- *Sổ điểm › Học bạ số*: one class at a time, filtered by status, with generating, batch signing,
  the PDF, and each record's check, signatures and versions.
- *Tài khoản*: the signing account.

## Demo data

- **SMS**: brandname THCS DEMO, seven templates, a quota of 300 for 9A1, and six texts: the
  start-of-year parent meeting (8 September), a storm closure cancelled the evening before, a staff
  meeting call to every teacher, a fee reminder to 6A1 and 6A2 with one text that failed, the 9A1
  homeroom teacher's own text about exam revision, and next week's 7A1 parent meeting, scheduled.
- **Sync**: in September, classes and students accepted by the Sở's database, a sign-in to CSDL
  ngành refused for a wrong password, the students accepted on the second try, and every teacher
  refused because no profile has a date of birth.
- **Học bạ số** of 9A1 (the class of [end-of-year.md](end-of-year.md)), signed at the end of May
  2027 by Phạm Quốc Bảo (Viettel MySign) and the principal Nguyễn Thị Hồng Hạnh (VNPT SmartCA),
  both sandbox accounts:

| Students | State |
| --- | --- |
| Khôi, Hân, Thịnh, Trang, Huy | issued on 29/05/2027 |
| Trần Bảo Ngọc | version 1 revoked to add the homeroom comment; version 2 issued on 05/06/2027 |
| Đặng Khánh Linh, Bùi Tuấn Kiệt | signed by the homeroom teacher, waiting for the principal |
| Đỗ Hải Đăng (made after his retakes), Lý Thanh Tâm | waiting for the homeroom teacher |
| Ngô Phương Thảo, Dương Văn Toàn | not made: their summer review is still open |

The principal has her own login, `hieutruong@demo.edu.vn / Admin@123`, to sign; `gv004@demo.edu.vn
/ Teacher@123` signs as the homeroom teacher. `admin@demo.edu.vn` has no signing account yet: any
account of 6 to 64 letters, digits or `._@+-` works in the sandbox. A demo seeded before this phase
gets this data on its next start.

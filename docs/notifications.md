# Notifications, parent accounts and the mobile apps

Phase 3 adds a notification outbox, parent and driver logins, and two phone-sized web apps
(`/parent` and `/driver`) next to the school portal.

## Accounts and roles

| Role | Logs in with | Sees |
| --- | --- | --- |
| `ADMIN`, `STAFF`, `TEACHER` | email | the portal (`/`) |
| `PARENT` | phone number | the parent app (`/parent`): their own children only |
| `DRIVER` | phone number | the driver app (`/driver`): the routes they drive or monitor |

Routes without an explicit `@Roles(...)` stay portal-only; parent and driver endpoints opt in with
`@Roles(Role.PARENT)` / `@Roles(Role.DRIVER)`, and `@AnyRole()` opens a route to everyone signed in
(notifications, RSVP, password change). `ParentAccessService.assertChild(user, studentId)` is the one
check every parent endpoint goes through: a parent only reaches students linked to their account.

Parent accounts are created by the school from guardian records (`POST /parents/accounts`,
`POST /parents/accounts/bulk`). One phone number is one account, so siblings share their parents'
login. The first-time password is shown once; `mustChangePassword` forces a change at first login.
Phones are normalised to `0xxxxxxxxx` (`+84` accepted).

## How a message travels

1. A module records something (gate scan, homeroom absence, invoice, payment, nurse's note, bus
   boarding, leave decision, announcement) and calls `NotificationsService.notifyGuardians(...)`,
   `notifyUsers(...)` or `notifyRoles(...)`. `AlertsService` holds the Vietnamese texts for the
   phase 1–2 modules; newer modules write their own.
2. A `Notification` row is created per recipient (the in-app inbox, always on) and pushed to any
   open SSE stream (`GET /notifications/stream?access_token=`), which the bell in the portal and the
   parent app listen to.
3. For every other channel the school enabled (`PUT /notifications/settings`, channels
   `PUSH`, `ZALO`, `SMS`, `EMAIL`), a `NotificationDelivery` row is queued.
4. `DispatcherService` drains the queue every `NOTIFY_DISPATCH_INTERVAL_MS` (claim by conditional
   update, exponential backoff 1/2/4/8 min, 5 attempts, then `FAILED`). A recipient with no phone,
   email or device token fails immediately without retry. `POST /notifications/deliveries/run`
   drains one school on demand; `/notifications/deliveries` and `/deliveries/summary` show the
   outbox (portal page *Thiết lập → Kênh thông báo*).

Alerts never fail the action that caused them: `AlertsService` logs and swallows its own errors.

## Channel adapters

`NOTIFY_PROVIDERS=PUSH=mock,ZALO=mock,SMS=mock,EMAIL=mock` maps each channel to an adapter
implementing `ChannelAdapter` (`src/notifications/channels/channel-adapter.ts`):

```ts
interface ChannelAdapter {
  channel: NotificationChannel;
  name: string;
  send(message: { to: string[]; title: string; body: string; data?: Record<string, unknown> }): Promise<{ externalRef: string }>;
}
```

Only the sandbox adapter exists. It records a fake reference and fails when the body contains
`[mock-fail]`, which is how retries are tested. Real adapters go in the same folder and are
registered in `channelAdaptersFactory`:

- **PUSH** – Firebase Cloud Messaging (device tokens come from `POST /notifications/push-tokens`).
- **ZALO** – Zalo Notification Service (ZNS) templates; the school registers an OA and templates.
- **SMS** – a brandname SMS gateway (eSMS, SpeedSMS, VNPT…).
- **EMAIL** – SMTP or a transactional email API.

Credentials belong in environment variables of the deployment, never in the repository.

## Parent app endpoints

| Endpoint | What it returns |
| --- | --- |
| `GET /parent/children` | children with today's gate status and homeroom attendance |
| `GET /parent/children/:id/attendance?month=` | day-by-day gate times and homeroom status |
| `GET /parent/children/:id/invoices`, `GET /parent/invoices/:id` | fees, with the VietQR to pay an open invoice |
| `GET/POST /parent/children/:id/meals` | menus of the month, register or cancel meals (cutoff enforced) |
| `GET /parent/children/:id/health` | health profile, check-ups, vaccinations, incidents |
| `GET /parent/children/:id/bus` | bus assignment, today's trip, boarding events, last position |
| `GET/PUT /parent/children/:id/services` | yearly service registration (canteen, bus, uniform, clubs) |
| `GET /notifications`, `POST /notifications/:id/read` | inbox |
| `GET /announcements/mine`, `POST /announcements/:id/rsvp` | school announcements and events |

## Notification kinds

`GATE_IN`, `GATE_OUT`, `HOMEROOM_ABSENT`, `HOMEROOM_LATE`, `BUS_BOARD`, `BUS_ALIGHT`, `INVOICE_ISSUED`,
`PAYMENT_RECEIVED`, `HEALTH_INCIDENT`, `LEAVE_DECIDED`, `ANNOUNCEMENT`, `EVENT`, `SYSTEM`.

## Privacy

Parents see their own children only; a guardian record is the link. Notifications carry the
student's name and the fact (time at the gate, amount due), nothing more. Delivery logs keep the
provider reference and the last error, not the message body of other channels.

# Điểm danh ra vào trường: kết nối máy quét

The gate attendance module is **device-agnostic**. Any face, fingerprint, card or QR terminal can feed it, either directly or through a small bridge, and guards or teachers can record check-ins by hand.

## Concepts

| Term | Meaning |
|---|---|
| **Device** (`AttendanceDevice`) | One terminal at a gate. Has an API key (generic API) and optionally a serial number (ZKTeco push). `defaultDirection` is used when the terminal does not say whether a scan is IN or OUT (e.g. a terminal that only sits on the entry lane). |
| **Identity** (`AttendanceIdentity`) | Maps the ID a terminal reports to a student or teacher. `BIOMETRIC` = the person ID under which a face/fingerprint is enrolled on the terminals; `CARD` / `QR` = card number or QR payload. |
| **Gate event** (`GateEvent`) | One scan or manual entry. Scans from IDs that are not mapped yet are stored as *unmatched* and are linked automatically when the identity is created later. |

Daily status: first arrival after the school's `lateAfter` time (default 07:15, school timezone) is **late**; no scan at all is **absent**.

## Option 1: generic JSON API (any vendor, or a bridge)

1. In the portal, **Điểm danh ra vào → Thiết bị & định danh → Máy chấm công / cổng → Thêm thiết bị**. Copy the API key (shown once).
2. The terminal, or a bridge service that listens to the vendor SDK/webhook, sends:

```http
POST /api/v1/attendance/ingest
X-Device-Key: sk_dev_xxxxxxxxxxxx.yyyyyyyy...
Content-Type: application/json

{
  "events": [
    { "eventId": "evt-000123", "personId": "1001", "occurredAt": "2026-10-05T07:02:11+07:00", "method": "FACE", "direction": "IN" }
  ]
}
```

- `eventId`: unique per device. Re-sending the same event is safe; it is reported as `duplicate`.
- `occurredAt`: ISO 8601. Without an offset, it is read in the school timezone.
- `method`: `FACE`, `FINGERPRINT`, `CARD`, `QR` or `UNKNOWN`. `direction`: `IN`, `OUT` or `UNKNOWN`.
- Up to 500 events per request. Events more than 5 minutes in the future are rejected (check the device clock).

Response:

```json
{ "accepted": 1, "unmatched": 0, "duplicates": 0, "rejected": 0, "results": [{ "eventId": "evt-000123", "status": "accepted" }] }
```

Typical bridges: Hikvision and Dahua access controllers can push event notifications (ISAPI / HTTP listening) or be polled through their SDK; a bridge converts each event to the format above. The full OpenAPI spec is at `/api/docs`.

## Option 2: ZKTeco ADMS / PUSH (no bridge)

ZKTeco terminals that support **ADMS** (Cloud Server) can talk to the API directly:

1. Register the device in the portal **with its serial number**.
2. On the terminal: *Comm → Cloud Server Setting*, set the server address and port to this API (the device calls `/iclock/cdata` on that host).
3. The terminal uploads `ATTLOG` records; verify mode 15 = face, 1 = fingerprint, 2/4 = card. Status 0/3/4 = IN, 1/2/5 = OUT.

The device's user ID (PIN) is the `externalId` of a `BIOMETRIC` identity (or `CARD`, for card-only users).

> This endpoint follows the publicly documented PUSH protocol and is covered by tests with sample payloads; it still needs to be checked against the pilot school's actual terminal model and firmware.

## Manual entry

`POST /api/v1/attendance/manual` (portal: **Báo cáo theo ngày → Vào / Ra**) records a check-in or check-out for a student or teacher with an optional note, for forgotten cards, failed scans or early pick-up.

## Biometric data and Decree 13/2023/ND-CP

Face and fingerprint data are *sensitive personal data*. For children, consent must come from a parent or guardian.

- The API **refuses to create a `BIOMETRIC` identity without `consentGivenBy` and `consentAt`**; `consentReference` can point to the signed form.
- Face/fingerprint scans only match `BIOMETRIC` identities, so a student without recorded consent is never identified from biometrics, even if a terminal reports their ID. Card, QR and manual check-in work without biometric consent.
- **Revoking** an identity stops matching immediately. Biometric templates live on the terminals, so the school must also delete the person from the device.
- The system stores only the terminal's person ID, never face images or fingerprint templates.

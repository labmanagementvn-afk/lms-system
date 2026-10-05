# Học phí, thanh toán QR và đồng bộ MISA

Phase 2 ships **sandbox implementations only**. No real payment gateway or MISA account is connected, and no credentials live in the repository. This page explains how money flows and how to plug in the real services.

## Money flow

1. **Khoản thu** (fee items) and **miễn giảm** (per-student discounts, percent or fixed, optionally per item and with a validity window).
2. **Đợt thu** (billing campaign): picks fee items and a scope (grades and/or classes of an academic year). *Phát hành* issues one invoice per studying student, applying their discounts. Running it again only bills students added since. With *cộng dồn nợ*, unpaid balances of earlier campaign invoices become a "Nợ kỳ trước" line on the new invoice and the old invoices are marked `CARRIED_OVER`. Cancelling the new invoice gives the debt back.
3. **Thu tiền**:
   - Cash or manually confirmed transfer at the desk: a receipt (phiếu thu) is numbered `PT2026-000001` per school.
   - VietQR: every open invoice has a QR with the remaining amount and a transfer note starting with its payment reference (`HP` + 8 characters). When the bank reports the transfer, the reference is found in the note (spaces and dashes are tolerated) and a receipt is created automatically. Paying with an old reference after a carry-over settles the newer invoice that now holds the debt.
   - Transfers that cannot be matched are kept under **Đối soát ngân hàng** to be matched or ignored by hand.
4. **Hủy phiếu thu** (admin only) reverses the balance and, for a bank receipt, puts the transfer back into reconciliation.
5. Every receipt, voided receipt, stock-in and stock-out is written to an **outbox** (`AccountingSyncJob`) in the same database transaction, then pushed to accounting.

Store orders (cấp phát) create an invoice with source `STORE`, so they are paid the same way.

## Payment providers

`apps/api/src/finance/providers/payment-provider.ts` defines the adapter:

- `createPaymentRequest()` returns what the payer scans (a VietQR payload; hosted-checkout providers may also return a URL).
- `parseWebhook(headers, body)` verifies the provider's signature and returns the transfers.

Webhook URL: `POST /api/v1/payments/webhooks/<provider>`. Transfers are matched to a school by the receiving account number (`FinanceSettings.bankAccountNo`) and de-duplicated by `(provider, transaction id)`, so replays are safe.

The bundled `mock` provider signs the JSON body with HMAC-SHA256 (`X-Mock-Signature`, secret `MOCK_PAYMENT_SECRET`). The portal's "Mô phỏng chuyển khoản (sandbox)" buttons call `POST /api/v1/finance/sandbox/transfers`, which goes through the same verification and matching path.

### Adding a real provider (PayOS, Casso, SePay, a bank API)

1. Implement `PaymentProvider` in `src/finance/providers/<name>.provider.ts`, following the provider's own signature scheme.
2. Register it in `paymentProvidersFactory()` (`finance.module.ts`), reading its keys from environment variables or a secret manager.
3. Set `PAYMENT_PROVIDERS=<name>` (comma-separated to enable several) and `PAYMENT_PROVIDER=<name>` for QR generation. Removing `mock` from `PAYMENT_PROVIDERS` also disables the sandbox endpoint.
4. Point the provider's webhook at `/api/v1/payments/webhooks/<name>`.

## Accounting (MISA AMIS)

`src/accounting/` holds the outbox:

- Jobs are unique per `(kind, entityId)`, so a document is never queued twice.
- A timer (`ACCOUNTING_SYNC_INTERVAL_MS`, default 60 s) and the **Đồng bộ ngay** button push due jobs.
- Failures retry with backoff (1, 2, 4, 8 minutes) and become `FAILED` after 5 attempts; **Thử lại** re-queues them.

Vouchers are built in `misa-payloads.ts`:

| Document | Entry |
|---|---|
| Phiếu thu tiền mặt | Dr 1111 / Cr 131, per student (account object = student code) |
| Giấy báo có (QR, chuyển khoản) | Dr 1121 / Cr 131 |
| Hủy phiếu thu | The same voucher with negative amounts, linked to the original number |
| Phiếu nhập kho | Dr 1561 / Cr 1111, item code = `accountingCode` or SKU |
| Phiếu xuất kho (cấp phát) | Dr 632 / Cr 1561 |

The account numbers are defaults to be confirmed with each school's accountant. Revenue recognition for the invoices themselves (Dr 131 / Cr 511x per fee item `accountingCode`) is not pushed yet; confirm with the school whether they want it per campaign.

### Connecting MISA AMIS

1. Get API access from MISA for each school (app ID and access code from the school's AMIS account).
2. Implement `AccountingAdapter` in `src/accounting/misa-amis.adapter.ts`: authenticate, map the voucher to MISA's voucher API, and use the voucher number as the idempotency key (look the voucher up before creating it again after a timeout).
3. Register it in `accountingAdapterFactory()` and set `ACCOUNTING_PROVIDER=misa`, with per-school credentials stored outside the repository.

The `mock` adapter validates the voucher shape and returns `MISA-<kind>-<voucherNo>`. A description containing `[mock-fail]` makes it fail, to exercise retries.

import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { buildVietQr } from '../vietqr';
import { IncomingTransfer, PaymentProvider, PaymentRequest } from './payment-provider';

interface MockWebhookBody {
  transactions: { id: string; accountNo: string; amount: number; description: string; occurredAt: string }[];
}

/**
 * Sandbox provider. QR codes are real VietQR payloads (scannable, but the demo
 * account receives nothing); webhooks are signed with HMAC-SHA256 over the JSON
 * body using MOCK_PAYMENT_SECRET, sent in the X-Mock-Signature header.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly secret: string) {}

  async createPaymentRequest(req: PaymentRequest) {
    return { qrPayload: buildVietQr({ bankBin: req.bankBin, accountNo: req.accountNo, amount: req.amount, message: `${req.paymentRef} ${req.description}` }) };
  }

  sign(body: MockWebhookBody): string {
    return createHmac('sha256', this.secret).update(JSON.stringify(body)).digest('hex');
  }

  parseWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): IncomingTransfer[] {
    const given = String(headers['x-mock-signature'] ?? '');
    const expected = this.sign(body as MockWebhookBody);
    const a = Buffer.from(given, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid signature');
    const txns = (body as MockWebhookBody)?.transactions;
    if (!Array.isArray(txns)) return [];
    return txns.map((t) => ({
      externalId: String(t.id),
      accountNo: String(t.accountNo),
      amount: Math.round(Number(t.amount)),
      description: String(t.description ?? ''),
      occurredAt: new Date(t.occurredAt),
      raw: t,
    }));
  }
}

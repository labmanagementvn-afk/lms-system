export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

/** A transfer into one of the schools' bank accounts, as reported by a provider. */
export interface IncomingTransfer {
  externalId: string;
  accountNo: string;
  amount: number;
  description: string;
  occurredAt: Date;
  raw?: unknown;
}

export interface PaymentRequest {
  bankBin: string;
  accountNo: string;
  accountName?: string | null;
  amount: number;
  paymentRef: string;
  description: string;
}

/**
 * Adapter for a bank-transfer notification provider (e.g. PayOS, Casso, SePay,
 * or a bank's own open API). Each provider authenticates its webhook differently,
 * so verification lives in the adapter; matching to invoices is shared.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Builds what the payer scans. Providers with hosted checkout may also return a URL. */
  createPaymentRequest(req: PaymentRequest): Promise<{ qrPayload: string; checkoutUrl?: string }>;
  /** Verifies the webhook and returns the transfers it reports. Throws if the signature is invalid. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): IncomingTransfer[];
}

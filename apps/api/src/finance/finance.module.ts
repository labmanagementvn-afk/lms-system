import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { CampaignsService } from './campaigns.service';
import { FeeItemsService } from './fee-items.service';
import { FinanceController, PaymentWebhookController } from './finance.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDERS, PaymentProvider } from './providers/payment-provider';

/**
 * Enabled payment providers. Only the sandbox exists so far; a real provider
 * (PayOS, Casso, SePay, a bank API) is added here behind the same interface.
 */
export function paymentProvidersFactory(): Map<string, PaymentProvider> {
  const providers = new Map<string, PaymentProvider>();
  const enabled = (process.env.PAYMENT_PROVIDERS ?? 'mock').split(',').map((s) => s.trim());
  if (enabled.includes('mock')) providers.set('mock', new MockPaymentProvider(process.env.MOCK_PAYMENT_SECRET ?? 'mock-secret'));
  const unknown = enabled.filter((n) => !providers.has(n));
  if (unknown.length) throw new Error(`Payment providers not implemented: ${unknown.join(', ')}; see docs/finance-integrations.md`);
  return providers;
}

@Module({
  imports: [AcademicYearsModule],
  controllers: [FinanceController, PaymentWebhookController],
  providers: [
    FeeItemsService,
    CampaignsService,
    InvoicesService,
    PaymentsService,
    { provide: PAYMENT_PROVIDERS, useFactory: paymentProvidersFactory },
  ],
  exports: [PaymentsService],
})
export class FinanceModule {}

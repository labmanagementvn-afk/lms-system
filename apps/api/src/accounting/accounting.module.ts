import { Global, Module } from '@nestjs/common';
import { ACCOUNTING_ADAPTER, AccountingAdapter } from './accounting-adapter';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { MockMisaAdapter } from './mock-misa.adapter';

/** Picks the accounting adapter from ACCOUNTING_PROVIDER. Only the sandbox exists so far. */
export function accountingAdapterFactory(): AccountingAdapter {
  const provider = process.env.ACCOUNTING_PROVIDER ?? 'mock';
  if (provider === 'mock') return new MockMisaAdapter();
  throw new Error(`ACCOUNTING_PROVIDER "${provider}" is not implemented; see docs/finance-integrations.md`);
}

@Global()
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, { provide: ACCOUNTING_ADAPTER, useFactory: accountingAdapterFactory }],
  exports: [AccountingService],
})
export class AccountingModule {}

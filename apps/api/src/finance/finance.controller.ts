import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { CampaignsService } from './campaigns.service';
import { FeeItemsService } from './fee-items.service';
import {
  BankTxnQuery,
  CampaignDto,
  CashPaymentDto,
  DiscountDto,
  DiscountQuery,
  FeeItemDto,
  FinanceSettingsDto,
  IgnoreTxnDto,
  InvoiceQuery,
  ManualInvoiceDto,
  MatchTxnDto,
  PaymentQuery,
  SandboxTransferDto,
  UpdateCampaignDto,
  UpdateFeeItemDto,
  VoidPaymentDto,
} from './finance.dto';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@ApiTags('finance')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly feeItems: FeeItemsService,
    private readonly campaigns: CampaignsService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  // ---- Fee items ----

  @Get('fee-items')
  listFeeItems(@CurrentUser() user: AuthUser) {
    return this.feeItems.list(user.schoolId);
  }

  @Post('fee-items')
  createFeeItem(@CurrentUser() user: AuthUser, @Body() dto: FeeItemDto) {
    return this.feeItems.create(user.schoolId, dto);
  }

  @Patch('fee-items/:id')
  updateFeeItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFeeItemDto) {
    return this.feeItems.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('fee-items/:id')
  removeFeeItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feeItems.remove(user.schoolId, id);
  }

  // ---- Discounts ----

  @Get('discounts')
  listDiscounts(@CurrentUser() user: AuthUser, @Query() query: DiscountQuery) {
    return this.feeItems.discounts(user.schoolId, query);
  }

  @Post('discounts')
  createDiscount(@CurrentUser() user: AuthUser, @Body() dto: DiscountDto) {
    return this.feeItems.createDiscount(user.schoolId, dto);
  }

  @Delete('discounts/:id')
  removeDiscount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.feeItems.removeDiscount(user.schoolId, id);
  }

  // ---- Campaigns ----

  @Get('campaigns')
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.campaigns.list(user.schoolId);
  }

  @Get('campaigns/:id')
  getCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.get(user.schoolId, id);
  }

  @Post('campaigns')
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignDto) {
    return this.campaigns.create(user.schoolId, dto);
  }

  @Patch('campaigns/:id')
  updateCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(user.schoolId, id, dto);
  }

  @Delete('campaigns/:id')
  removeCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.remove(user.schoolId, id);
  }

  @Get('campaigns/:id/preview')
  previewCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.preview(user.schoolId, id);
  }

  @Post('campaigns/:id/generate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue invoices to every target student not yet billed in this campaign' })
  generate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.generate(user.schoolId, id);
  }

  @Post('campaigns/:id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.close(user.schoolId, id);
  }

  // ---- Invoices ----

  @Get('invoices')
  listInvoices(@CurrentUser() user: AuthUser, @Query() query: InvoiceQuery) {
    return this.invoices.list(user.schoolId, query);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.get(user.schoolId, id);
  }

  @Post('invoices')
  createInvoice(@CurrentUser() user: AuthUser, @Body() dto: ManualInvoiceDto) {
    return this.invoices.createManual(user.schoolId, dto);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(200)
  cancelInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.cancel(user.schoolId, id);
  }

  @Get('invoices/:id/payment-qr')
  @ApiOperation({ summary: 'VietQR payload for the remaining balance; the transfer note carries the invoice reference' })
  paymentQr(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.paymentQr(user.schoolId, id);
  }

  @Post('invoices/:id/payments')
  @ApiOperation({ summary: 'Record a cash (or manually confirmed bank) payment and issue a receipt' })
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CashPaymentDto) {
    return this.payments.recordCash(user, id, dto);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('campaignId') campaignId?: string) {
    return this.invoices.summary(user.schoolId, campaignId || undefined);
  }

  // ---- Payments (receipts) ----

  @Get('payments')
  listPayments(@CurrentUser() user: AuthUser, @Query() query: PaymentQuery) {
    return this.payments.list(user.schoolId, query);
  }

  @Roles(Role.ADMIN)
  @Post('payments/:id/void')
  @HttpCode(200)
  voidPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidPaymentDto) {
    return this.payments.void(user, id, dto.reason);
  }

  // ---- Bank reconciliation ----

  @Get('bank-transactions')
  listBankTransactions(@CurrentUser() user: AuthUser, @Query() query: BankTxnQuery) {
    return this.payments.listBankTransactions(user.schoolId, query);
  }

  @Post('bank-transactions/:id/match')
  @HttpCode(200)
  match(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MatchTxnDto) {
    return this.payments.matchTransaction(user, id, dto.invoiceId);
  }

  @Post('bank-transactions/:id/ignore')
  @HttpCode(200)
  ignore(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: IgnoreTxnDto) {
    return this.payments.ignoreTransaction(user.schoolId, id, dto.note);
  }

  @Post('sandbox/transfers')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sandbox only: simulate a bank transfer into the school account' })
  sandboxTransfer(@CurrentUser() user: AuthUser, @Body() dto: SandboxTransferDto) {
    return this.payments.sandboxTransfer(user.schoolId, dto.amount, dto.description);
  }

  // ---- Settings ----

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.payments.settings(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: FinanceSettingsDto) {
    return this.payments.updateSettings(user.schoolId, dto);
  }
}

@ApiTags('finance')
@Controller('payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post(':provider')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Bank transfer notifications from a payment provider',
    description: 'Each provider verifies its own signature. Replays are safe: transfers are de-duplicated by provider transaction ID.',
  })
  webhook(@Param('provider') name: string, @Headers() headers: Record<string, string>, @Body() body: unknown) {
    const provider = this.payments.provider(name);
    return this.payments.ingestTransfers(provider.name, provider.parseWebhook(headers, body));
  }
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DiscountKind, FeeUnit, InvoiceSource, InvoiceStatus, PaymentMethod, BankTxnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- Fee items & discounts ----

export class FeeItemDto {
  @ApiProperty({ example: 'HOCPHI' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Học phí' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: FeeUnit })
  @IsOptional()
  @IsEnum(FeeUnit)
  unit?: FeeUnit;

  @ApiProperty({ example: 1_500_000, description: 'VND' })
  @IsInt()
  @Min(0)
  defaultAmount: number;

  @ApiPropertyOptional({ example: '5113', description: 'Revenue account or item code in the accounting system' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFeeItemDto extends PartialType(FeeItemDto) {}

export class DiscountDto {
  @ApiProperty()
  @IsString()
  studentId: string;

  @ApiPropertyOptional({ description: 'Leave empty to apply to every fee item' })
  @IsOptional()
  @IsString()
  feeItemId?: string;

  @ApiProperty({ enum: DiscountKind })
  @IsEnum(DiscountKind)
  kind: DiscountKind;

  @ApiProperty({ description: 'Percent (0-100) or VND' })
  @IsInt()
  @Min(1)
  value: number;

  @ApiProperty({ example: 'Anh chị em ruột cùng học tại trường' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class DiscountQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}

// ---- Campaigns ----

export class CampaignItemDto {
  @ApiProperty()
  @IsString()
  feeItemId: string;

  @ApiPropertyOptional({ description: 'Defaults to the fee item amount' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}

export class CampaignDto {
  @ApiProperty({ example: 'Học phí tháng 10/2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Defaults to the current academic year' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiProperty({ example: '2026-10-15' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ type: [Number], description: 'Empty = all grades' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  gradeLevels?: number[];

  @ApiPropertyOptional({ type: [String], description: 'Empty = all classes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ default: true, description: 'Move unpaid balances of earlier invoices onto the new invoice' })
  @IsOptional()
  @IsBoolean()
  carryOverDebt?: boolean;

  @ApiProperty({ type: [CampaignItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CampaignItemDto)
  items: CampaignItemDto[];
}

export class UpdateCampaignDto extends PartialType(CampaignDto) {}

// ---- Invoices ----

export class InvoiceQuery extends PageQuery {
  @ApiPropertyOptional({ enum: InvoiceStatus, isArray: true })
  @IsOptional()
  @IsEnum(InvoiceStatus, { each: true })
  status?: InvoiceStatus | InvoiceStatus[];

  @ApiPropertyOptional({ enum: InvoiceSource })
  @IsOptional()
  @IsEnum(InvoiceSource)
  source?: InvoiceSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}

export class ManualInvoiceLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feeItemId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  unitPrice: number;
}

export class ManualInvoiceDto {
  @ApiProperty()
  @IsString()
  studentId: string;

  @ApiProperty({ example: 'Phí dã ngoại học kỳ I' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ type: [ManualInvoiceLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ManualInvoiceLineDto)
  lines: ManualInvoiceLineDto[];
}

// ---- Payments ----

export class CashPaymentDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER], default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class VoidPaymentDto {
  @ApiProperty({ example: 'Thu nhầm học sinh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}

export class PaymentQuery extends PageQuery {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class BankTxnQuery extends PageQuery {
  @ApiPropertyOptional({ enum: BankTxnStatus })
  @IsOptional()
  @IsEnum(BankTxnStatus)
  status?: BankTxnStatus;
}

export class MatchTxnDto {
  @ApiProperty()
  @IsString()
  invoiceId: string;
}

export class IgnoreTxnDto {
  @ApiProperty({ example: 'Chuyển nhầm, đã hoàn lại' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note: string;
}

export class SandboxTransferDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'HPK3XQ9Z7M Tran Minh Anh hoc phi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;
}

// ---- Settings ----

export class FinanceSettingsDto {
  @ApiPropertyOptional({ example: '970436', description: 'NAPAS BIN of the receiving bank' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Mã BIN ngân hàng gồm 6 chữ số' })
  bankBin?: string;

  @ApiPropertyOptional({ example: 'Vietcombank' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankName?: string;

  @ApiPropertyOptional({ example: '0011001234567' })
  @IsOptional()
  @Matches(/^[0-9A-Za-z]{4,19}$/, { message: 'Số tài khoản không hợp lệ' })
  bankAccountNo?: string;

  @ApiPropertyOptional({ example: 'TRUONG THCS DEMO' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @ApiPropertyOptional({ example: 'PT' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,6}$/, { message: 'Tiền tố gồm tối đa 6 chữ in hoa hoặc số' })
  receiptPrefix?: string;
}

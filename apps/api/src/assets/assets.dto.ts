import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- Categories and suppliers ----

export class CategoryDto {
  @ApiProperty({ example: 'Máy tính' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ default: 5, description: 'Số năm khấu hao mặc định; 0 = không khấu hao' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  usefulLifeYears?: number;
}

export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class SupplierDto {
  @ApiProperty({ example: 'Công ty TNHH Thiết bị Giáo dục ABC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: '02438123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'sales@abc.vn' })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: '0101234567', description: 'Mã số thuế' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;
}

export class UpdateSupplierDto extends PartialType(SupplierDto) {}

// ---- Assets ----

export class AssetQuery extends PageQuery {
  @ApiPropertyOptional({ enum: AssetStatus })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Phòng 101' })
  @IsOptional()
  @IsString()
  location?: string;
}

/** Statuses an asset can be given directly; LENT and DISPOSED only come from the loan and dispose flows. */
export const SETTABLE_STATUSES = [AssetStatus.IN_USE, AssetStatus.IN_STORAGE, AssetStatus.UNDER_MAINTENANCE] as const;

export class CreateAssetDto {
  @ApiPropertyOptional({ example: 'TS00001', description: 'Mã tài sản; để trống để tự sinh TS#####' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9._-]{2,20}$/, { message: 'Mã tài sản gồm 2-20 chữ, số, dấu chấm, gạch' })
  code?: string;

  @ApiProperty({ example: 'Máy chiếu Epson EB-X51' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'X51-2024-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @ApiPropertyOptional({ example: '2024-03-15' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional({ example: 12000000, description: 'Nguyên giá (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Số năm khấu hao; mặc định theo danh mục' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  usefulLifeYears?: number;

  @ApiPropertyOptional({ example: 'Phòng 101' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ description: 'Nhân viên quản lý / sử dụng' })
  @IsOptional()
  @IsString()
  custodianEmployeeId?: string;

  @ApiPropertyOptional({ enum: SETTABLE_STATUSES, default: AssetStatus.IN_USE })
  @IsOptional()
  @IsIn(SETTABLE_STATUSES)
  status?: (typeof SETTABLE_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

export class DisposeDto {
  @ApiPropertyOptional({ example: 'Hỏng không sửa được, thanh lý theo QĐ 12/2026' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MaintenanceDto {
  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Thay bóng đèn máy chiếu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @ApiPropertyOptional({ example: 1500000, description: 'Chi phí (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'Công ty Điện máy Xanh' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @ApiPropertyOptional({ example: '2027-04-05', description: 'Lần bảo trì tiếp theo' })
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @ApiPropertyOptional({ description: 'true = tài sản đang đem đi sửa (chuyển trạng thái Đang sửa chữa)' })
  @IsOptional()
  @IsBoolean()
  inProgress?: boolean;
}

export class LoanDto {
  @ApiPropertyOptional({ description: 'Nhân viên mượn' })
  @IsOptional()
  @IsString()
  borrowerEmployeeId?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn An', description: 'Người mượn ngoài danh sách nhân viên' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  borrowerName?: string;

  @ApiPropertyOptional({ example: 'Tổ Toán' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiProperty({ example: '2026-10-20T10:00:00.000Z', description: 'Hạn trả' })
  @IsDateString()
  dueAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class LoanQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'true = chỉ phiếu chưa trả' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  open?: boolean;
}

// ---- Audits (kiểm kê) ----

export class AuditDto {
  @ApiProperty({ example: 'Kiểm kê cuối năm 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: '2026-12-20' })
  @IsDateString()
  date: string;
}

export class AuditItemDto {
  @ApiProperty({ description: 'true = có mặt, false = thiếu' })
  @IsBoolean()
  found: boolean;

  @ApiPropertyOptional({ example: 'Tốt' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

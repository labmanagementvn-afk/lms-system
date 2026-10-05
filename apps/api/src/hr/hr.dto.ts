import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EmployeeDocumentKind, EmployeeStatus, EmploymentType, Gender, LeaveStatus, LeaveType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- Employees ----

export class EmployeeQuery extends PageQuery {
  @ApiPropertyOptional({ example: 'Giáo viên' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class CreateEmployeeDto {
  @ApiPropertyOptional({ example: 'NV001', description: 'Mã nhân viên; để trống để tự sinh NV###' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9._-]{2,20}$/, { message: 'Mã nhân viên gồm 2-20 chữ, số, dấu chấm, gạch' })
  code?: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '001090012345', description: 'Số CCCD' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  idNumber?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'an.nv@demo.edu.vn' })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Hành chính' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiProperty({ example: 'Kế toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  position: string;

  @ApiPropertyOptional({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ example: '2020-09-01' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ description: 'Liên kết với giáo viên có sẵn (dùng chung tài khoản đăng nhập); null để bỏ liên kết' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  teacherId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

// ---- Documents, contracts, work history ----

export class DocumentDto {
  @ApiProperty({ enum: EmployeeDocumentKind })
  @IsEnum(EmployeeDocumentKind)
  kind: EmployeeDocumentKind;

  @ApiProperty({ example: 'Bằng cử nhân Sư phạm Toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Đại học Sư phạm Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuer?: string;

  @ApiPropertyOptional({ example: '2012-06-30' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2027-06-30', description: 'Để trống nếu không có hạn' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Đường dẫn file scan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;
}

export class UpdateDocumentDto extends PartialType(DocumentDto) {}

export class ContractDto {
  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  type: EmploymentType;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2027-08-31', description: 'Để trống với hợp đồng không xác định thời hạn' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 12000000, description: 'Lương cơ bản (VND/tháng)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractDto extends PartialType(ContractDto) {}

export class WorkHistoryDto {
  @ApiProperty({ example: '2015-09-01' })
  @IsDateString()
  fromDate: string;

  @ApiPropertyOptional({ example: '2020-08-31', description: 'Để trống nếu đang tiếp diễn' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ example: 'Trường THCS Nguyễn Du' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  organization: string;

  @ApiProperty({ example: 'Giáo viên Toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  position: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ExpiringQuery {
  @ApiPropertyOptional({ default: 60, description: 'Giấy tờ / hợp đồng hết hạn trong N ngày tới (kể cả đã hết hạn)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(730)
  days = 60;
}

// ---- Leave ----

export class LeaveQuery extends PageQuery {
  @ApiPropertyOptional({ enum: LeaveStatus })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class LeaveRequestDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  type: LeaveType;

  @ApiProperty({ example: '2026-10-12' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2026-10-14' })
  @IsDateString()
  toDate: string;

  @ApiProperty({ example: 'Việc gia đình' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class CreateLeaveDto extends LeaveRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;
}

export class DecideLeaveDto {
  @ApiProperty({ enum: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] })
  @IsIn([LeaveStatus.APPROVED, LeaveStatus.REJECTED])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Đồng ý, nhờ GV Hà dạy thay' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ApplicationSource, ApplicationStatus, Gender, GuardianRelationship } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- Rounds ----

export class RoundDto {
  @ApiProperty({ example: 'Tuyển sinh lớp 6 năm học 2027-2028' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel: number;

  @ApiProperty({ example: '2027-03-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2027-06-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 90, description: 'Chỉ tiêu; vượt chỉ tiêu chỉ cảnh báo' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Năm học nhập học; mặc định là năm học hiện tại' })
  @IsOptional()
  @IsString()
  academicYearId?: string;
}

export class UpdateRoundDto extends PartialType(RoundDto) {}

// ---- Applications ----

/** The public form; staff create MANUAL applications with the same fields. */
export class ApplicationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  roundId: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ example: '2015-09-01' })
  @IsDateString()
  dateOfBirth: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Tiểu học Kim Đồng' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousSchool?: string;

  @ApiProperty({ example: 'Nguyễn Văn Bình' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  guardianName: string;

  @ApiProperty({ example: '0903123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  guardianPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(120)
  guardianEmail?: string;

  @ApiPropertyOptional({ enum: GuardianRelationship, default: GuardianRelationship.GUARDIAN })
  @IsOptional()
  @IsEnum(GuardianRelationship)
  guardianRelationship?: GuardianRelationship;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateApplicationDto extends PartialType(OmitType(ApplicationDto, ['roundId'] as const)) {
  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  screeningNote?: string;
}

export class ApplicationStatusDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @ApiPropertyOptional({ description: 'Ghi vào ghi chú xét tuyển' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ApplicationQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roundId?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ enum: ApplicationSource })
  @IsOptional()
  @IsEnum(ApplicationSource)
  source?: ApplicationSource;
}

export class RoundFilterQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roundId?: string;
}

export class ImportApplicationsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  roundId: string;

  @ApiProperty({ description: 'Nội dung file CSV (UTF-8, phân cách bằng dấu phẩy hoặc chấm phẩy)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5_000_000)
  csv: string;
}

export class EnrolDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;
}

export class BulkEnrolDto extends EnrolDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids: string[];
}

// ---- Public ----

export class PublicLookupQuery {
  @ApiProperty({ example: '0903123456', description: 'Số điện thoại người giám hộ đã khai trên hồ sơ' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

// ---- Service registrations ----

export const UNIFORM_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

export class UniformDto {
  @ApiPropertyOptional({ enum: UNIFORM_SIZES })
  @IsOptional()
  @IsIn(UNIFORM_SIZES)
  shirtSize?: string;

  @ApiPropertyOptional({ enum: UNIFORM_SIZES })
  @IsOptional()
  @IsIn(UNIFORM_SIZES)
  pantsSize?: string;

  @ApiPropertyOptional({ example: 2, description: 'Số bộ' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;
}

export class ServiceRegistrationDto {
  @ApiProperty({ description: 'Bán trú' })
  @IsBoolean()
  canteen: boolean;

  @ApiProperty({ description: 'Xe đưa đón' })
  @IsBoolean()
  bus: boolean;

  @ApiPropertyOptional({ example: 'Ngã tư Láng Hạ - Thái Hà' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  busStopNote?: string;

  @ApiPropertyOptional({ type: UniformDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UniformDto)
  uniform?: UniformDto;

  @ApiPropertyOptional({ type: [String], example: ['CLB bóng đá'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  extras?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export const SERVICE_STATUS_FILTERS = ['SUBMITTED', 'CONFIRMED', 'NONE'] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUS_FILTERS)[number];

export class ServiceQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ enum: SERVICE_STATUS_FILTERS, description: 'NONE = chưa đăng ký' })
  @IsOptional()
  @IsIn(SERVICE_STATUS_FILTERS)
  status?: ServiceStatusFilter;
}

export class ClassFilterQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

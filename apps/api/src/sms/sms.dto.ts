import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SmsAudience, SmsCampaignStatus, SyncStatus } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class SmsTemplateDto {
  @ApiProperty({ example: 'Mời họp phụ huynh' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập tên mẫu' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: SmsAudience })
  @IsEnum(SmsAudience)
  audience: SmsAudience;

  @ApiProperty({ example: 'Kính mời phụ huynh em {hoc_sinh} lớp {lop} dự họp lúc 8h00 Chủ nhật.' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập nội dung' })
  @MaxLength(1000)
  body: string;
}

export class UpdateSmsTemplateDto extends PartialType(SmsTemplateDto) {}

export class SmsSettingsDto {
  @ApiPropertyOptional({ example: 'THCS DEMO', nullable: true, description: 'Tên thương hiệu đã đăng ký với nhà mạng (tối đa 11 ký tự)' })
  @IsOptional()
  @ValidateIf((o) => o.brandname !== null)
  @IsString()
  @MaxLength(11)
  @Matches(/^[A-Za-z0-9 ._-]+$/, { message: 'Brandname chỉ gồm chữ cái không dấu, số, dấu cách, dấu chấm và gạch' })
  brandname?: string | null;

  @ApiPropertyOptional({ example: 200, description: 'Số tin nhắn mỗi lớp được gửi phụ huynh trong một tháng' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  classMonthlyQuota?: number;

  @ApiPropertyOptional({ example: 500, description: 'Số tin nhắn mỗi tháng cho tin gửi giáo viên, cán bộ' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  schoolMonthlyQuota?: number;
}

export class ClassQuotaDto {
  @ApiProperty({ example: 300, nullable: true, description: 'null: dùng hạn mức chung của trường' })
  @ValidateIf((o) => o.monthlyLimit !== null)
  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyLimit: number | null;
}

export class UsageQuery {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng có dạng YYYY-MM' })
  month?: string;
}

export class TemplateQuery {
  @ApiPropertyOptional({ enum: SmsAudience })
  @IsOptional()
  @IsEnum(SmsAudience)
  audience?: SmsAudience;
}

/** Who gets the text and what it says. */
export class SmsPreviewDto {
  @ApiProperty({ enum: SmsAudience })
  @IsEnum(SmsAudience)
  audience: SmsAudience;

  @ApiPropertyOptional({ type: [String], description: 'Phụ huynh của mọi học sinh các lớp này' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Phụ huynh của các học sinh này' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3000)
  @IsString({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  teacherIds?: string[];

  @ApiPropertyOptional({ description: 'Mọi giáo viên đang công tác' })
  @IsOptional()
  @IsBoolean()
  allTeachers?: boolean;

  @ApiProperty({ example: 'Kính mời phụ huynh em {hoc_sinh} lớp {lop} dự họp lúc 8h00 Chủ nhật.' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập nội dung tin nhắn' })
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({ default: false, description: 'Tin nhắn có dấu (70 ký tự mỗi tin)' })
  @IsOptional()
  @IsBoolean()
  accented?: boolean;

  @ApiPropertyOptional({ description: 'Hẹn giờ gửi (ISO); bỏ trống để gửi ngay' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class SmsCampaignDto extends SmsPreviewDto {
  @ApiProperty({ example: 'Họp phụ huynh cuối học kỳ I' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập tiêu đề' })
  @MaxLength(120)
  title: string;
}

export class CampaignQuery extends PageQuery {
  @ApiPropertyOptional({ enum: SmsCampaignStatus })
  @IsOptional()
  @IsEnum(SmsCampaignStatus)
  status?: SmsCampaignStatus;

  @ApiPropertyOptional({ enum: SmsAudience })
  @IsOptional()
  @IsEnum(SmsAudience)
  audience?: SmsAudience;
}

export class MessageQuery extends PageQuery {
  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  status?: SyncStatus;
}

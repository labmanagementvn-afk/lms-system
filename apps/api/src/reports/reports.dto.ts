import { ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionStatus, StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every parameter any report takes; each report says which ones it needs. */
export class ReportQuery {
  @ApiPropertyOptional({ enum: ['json', 'pdf', 'xlsx'], description: 'json previews the document' })
  @IsOptional()
  @IsIn(['json', 'pdf', 'xlsx'])
  format?: 'json' | 'pdf' | 'xlsx';

  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() academicYearId?: string;

  @ApiPropertyOptional({ description: '0 = cả năm' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  semester?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Một ngày bất kỳ trong tuần' }) @IsOptional() @Matches(DATE) week?: string;

  @ApiPropertyOptional({ example: 1, description: 'Đợt xét công nhận hoàn thành chương trình THCS (1 hoặc 2)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  round?: number;

  @ApiPropertyOptional({ enum: StudentStatus }) @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @ApiPropertyOptional({ enum: PromotionStatus }) @IsOptional() @IsEnum(PromotionStatus) promotion?: PromotionStatus;

  @ApiPropertyOptional({ example: 'Hiệu trưởng' }) @IsOptional() @IsString() @MaxLength(100) signerTitle?: string;
  @ApiPropertyOptional({ example: 'Trịnh Thị Phương Mai' }) @IsOptional() @IsString() @MaxLength(100) signerName?: string;
  @ApiPropertyOptional({ example: 'Đồng Nai' }) @IsOptional() @IsString() @MaxLength(100) place?: string;
}

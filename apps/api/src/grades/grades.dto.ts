import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssessmentType, PromotionStatus, ScoreKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SEMESTER_MESSAGE = 'Học kỳ phải là 1 hoặc 2';
const TERM_MESSAGE = 'Học kỳ phải là 0 (cả năm), 1 hoặc 2';

// ---- Subject settings ----

export class SubjectSettingDto {
  @ApiProperty({ enum: AssessmentType })
  @IsEnum(AssessmentType)
  assessment: AssessmentType;

  @ApiProperty({ example: 3, description: 'Số điểm thường xuyên mỗi học kỳ' })
  @IsInt()
  @Min(1)
  @Max(10)
  regularCount: number;

  @ApiPropertyOptional({ example: 140, description: 'Số tiết mỗi năm học' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  periodsPerYear?: number;
}

// ---- Gradebook ----

export class BookQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;
}

export class ScoreEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ enum: ScoreKind })
  @IsEnum(ScoreKind)
  kind: ScoreKind;

  @ApiPropertyOptional({ example: 1, description: 'Thứ tự của điểm thường xuyên (1..n); GK/CK luôn là 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  index?: number;

  @ApiPropertyOptional({ example: 8.5, description: 'Điểm 0–10 bước 0,1; null để xóa' })
  @IsOptional()
  @ValidateIf((o) => o.value !== null)
  @IsNumber()
  @Min(0)
  @Max(10)
  value?: number | null;

  @ApiPropertyOptional({ description: 'Môn đánh giá bằng nhận xét: Đạt (true) / Chưa đạt (false); null để xóa' })
  @IsOptional()
  @ValidateIf((o) => o.passed !== null)
  @IsBoolean()
  passed?: boolean | null;

  @ApiPropertyOptional({ example: 'Tiến bộ rõ rệt' })
  @IsOptional()
  @ValidateIf((o) => o.note !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SaveBookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;

  @ApiProperty({ type: [ScoreEntryDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ScoreEntryDto)
  entries: ScoreEntryDto[];
}

// ---- Results ----

export class ResultsQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 1, description: '0 = cả năm' })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2], { message: TERM_MESSAGE })
  semester: number;
}

export class RecomputeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 1, description: '0 = cả năm' })
  @IsInt()
  @IsIn([0, 1, 2], { message: TERM_MESSAGE })
  semester: number;
}

export class UpdateResultDto {
  @ApiProperty({ example: 0, description: '0 = cả năm' })
  @IsInt()
  @IsIn([0, 1, 2], { message: TERM_MESSAGE })
  semester: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(366)
  absentDays?: number;

  @ApiPropertyOptional({ example: 'Ngoan, chăm học' })
  @IsOptional()
  @ValidateIf((o) => o.homeroomComment !== null)
  @IsString()
  @MaxLength(2000)
  homeroomComment?: string | null;

  @ApiPropertyOptional({ enum: PromotionStatus, description: 'Ghi đè kết quả lên lớp (chỉ cả năm)' })
  @IsOptional()
  @IsEnum(PromotionStatus)
  promotion?: PromotionStatus;
}

export class LockDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;
}

// ---- Transcript, student and parent apps ----

export class TranscriptQuery {
  @ApiPropertyOptional({ description: 'Mặc định là năm học hiện tại' })
  @IsOptional()
  @IsString()
  academicYearId?: string;
}

export class SemesterQuery {
  @ApiPropertyOptional({ example: 1, description: '0 = cả năm; mặc định 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2], { message: TERM_MESSAGE })
  semester?: number;
}

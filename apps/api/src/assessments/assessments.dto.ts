import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { QuestionType, TestKind, TestStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

// ---- question bank ----

export class QuestionQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @ApiPropertyOptional({ example: 2, description: '1 nhận biết … 6 sáng tạo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  difficulty?: number;

  @ApiPropertyOptional({ example: 'phân số' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ default: true, description: 'false: chỉ câu hỏi đã ẩn; bỏ trống: đang dùng' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiProperty({ example: 'Kết quả của 1/2 + 1/3 là?' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung câu hỏi không được để trống' })
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Tùy loại câu hỏi, xem grading.ts' })
  @IsOptional()
  @Allow()
  options?: unknown;

  @ApiPropertyOptional({ description: 'Đáp án đúng, tùy loại câu hỏi' })
  @IsOptional()
  @Allow()
  answer?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string;

  @ApiPropertyOptional({ type: [String], example: ['chương 1', 'phân số'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

export class ImportQuestionsDto {
  @ApiProperty({ description: 'Nội dung CSV: type, content, optionA..D, answer, difficulty, subjectCode, gradeLevel, tags, explanation' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung CSV trống' })
  @MaxLength(5_000_000)
  csv: string;
}

// ---- tests ----

export class TestQuery extends PageQuery {
  @ApiPropertyOptional({ enum: TestKind })
  @IsOptional()
  @IsEnum(TestKind)
  kind?: TestKind;

  @ApiPropertyOptional({ enum: TestStatus })
  @IsOptional()
  @IsEnum(TestStatus)
  status?: TestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;
}

export class TestQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0.25)
  @Max(100)
  points: number;
}

export class CreateTestDto {
  @ApiPropertyOptional({ enum: TestKind, default: TestKind.QUIZ })
  @IsOptional()
  @IsEnum(TestKind)
  kind?: TestKind;

  @ApiProperty({ example: 'Kiểm tra 15 phút – Phân số' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Khóa học chứa bài kiểm tra (tùy chọn)' })
  @ValidateIf((o) => o.courseId !== null)
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.subjectId !== null)
  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @ApiPropertyOptional({ example: 6 })
  @ValidateIf((o) => o.gradeLevel !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number | null;

  @ApiPropertyOptional({ example: 15, description: 'Phút; bỏ trống = không giới hạn' })
  @ValidateIf((o) => o.timeLimitMin !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  timeLimitMin?: number | null;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Học sinh xem được đáp án sau khi nộp' })
  @IsOptional()
  @IsBoolean()
  showResults?: boolean;

  @ApiPropertyOptional({ example: 50 })
  @ValidateIf((o) => o.passPercent !== null)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passPercent?: number | null;

  @ApiPropertyOptional({ example: '2026-10-06T00:00:00.000Z' })
  @ValidateIf((o) => o.openAt !== null)
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian mở không hợp lệ' })
  openAt?: string | null;

  @ApiPropertyOptional({ example: '2026-10-20T16:00:00.000Z' })
  @ValidateIf((o) => o.closeAt !== null)
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian đóng không hợp lệ' })
  closeAt?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Lớp được giao; trống + CONTEST = toàn trường' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ type: [TestQuestionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TestQuestionDto)
  questions?: TestQuestionDto[];
}

export class UpdateTestDto extends PartialType(CreateTestDto) {}

export class SetTestQuestionsDto {
  @ApiProperty({ type: [TestQuestionDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TestQuestionDto)
  questions: TestQuestionDto[];
}

export class RandomQuestionsDto {
  @ApiPropertyOptional({ description: 'Mặc định theo môn của bài kiểm tra' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 6, description: 'Mặc định theo khối của bài kiểm tra' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @ApiProperty({ example: { 1: 4, 2: 3, 3: 2 }, description: 'Số câu cần lấy theo mức độ 1-6' })
  @IsObject()
  counts: Record<string, number>;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(100)
  points?: number;
}

export class GradeAttemptDto {
  @ApiProperty({ example: { cm123: 2.5 }, description: 'Điểm theo câu hỏi (≤ điểm tối đa của câu)' })
  @IsObject()
  items: Record<string, number>;
}

export class LeaderboardQuery {
  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

// ---- student app ----

export class SaveAnswersDto {
  @ApiProperty({ example: { cm123: { key: 'A' } } })
  @IsObject()
  answers: Record<string, unknown>;
}

export class SubmitAttemptDto {
  @ApiPropertyOptional({ example: { cm123: { key: 'A' } }, description: 'Bỏ trống = nộp các câu trả lời đã lưu' })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

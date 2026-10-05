import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// ---- Criteria (tiêu chí rèn luyện) ----

export class CriterionDto {
  @ApiProperty({ example: 'RL01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã tiêu chí chỉ gồm chữ, số, gạch ngang hoặc gạch dưới' })
  code: string;

  @ApiProperty({ example: 'Chuyên cần, đi học đúng giờ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(100)
  maxPoints: number;

  @ApiPropertyOptional({ example: 'Ý thức học tập' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCriterionDto extends PartialType(CriterionDto) {}

export class CriterionRowDto extends CriterionDto {
  @ApiPropertyOptional({ description: 'Bỏ trống để thêm tiêu chí mới' })
  @IsOptional()
  @IsString()
  id?: string;
}

export class SaveCriteriaDto {
  @ApiProperty({ type: [CriterionRowDto], description: 'Toàn bộ danh sách tiêu chí; tiêu chí không có trong danh sách sẽ bị xóa hoặc ngừng áp dụng' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CriterionRowDto)
  criteria: CriterionRowDto[];
}

// ---- Class workflow ----

export class SemesterMonthQuery {
  @ApiProperty({ example: 1, description: 'Học kỳ 1 hoặc 2' })
  @Type(() => Number)
  @IsIn([1, 2], { message: 'Học kỳ phải là 1 hoặc 2' })
  semester: number;

  @ApiPropertyOptional({ example: 0, description: '0 = cả học kỳ, 1-12 = đánh giá theo tháng' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(12)
  month = 0;
}

export class ClassQuery extends SemesterMonthQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;
}

export class OpenClassDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 1 })
  @IsIn([1, 2], { message: 'Học kỳ phải là 1 hoặc 2' })
  semester: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  month = 0;
}

export class ClassStudentsDto extends OpenClassDto {
  @ApiPropertyOptional({ type: [String], description: 'Mặc định: mọi học sinh đủ điều kiện của lớp' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  studentIds?: string[];
}

export class ReviewItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  criterionId: string;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(0)
  @Max(100)
  teacherPoints: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewDto {
  @ApiProperty({ type: [ReviewItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  items: ReviewItemDto[];

  @ApiPropertyOptional({ example: 'Em có tiến bộ, cần tập trung hơn trong giờ học' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherComment?: string;
}

export class SummaryQuery {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsIn([1, 2], { message: 'Học kỳ phải là 1 hoặc 2' })
  semester: number;
}

// ---- Student app ----

export class SelfItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  criterionId: string;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(0)
  @Max(100)
  selfPoints: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SelfAssessDto {
  @ApiProperty({ example: 1 })
  @IsIn([1, 2], { message: 'Học kỳ phải là 1 hoặc 2' })
  semester: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  month = 0;

  @ApiProperty({ type: [SelfItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SelfItemDto)
  items: SelfItemDto[];

  @ApiPropertyOptional({ example: 'Em tự thấy mình đi học đầy đủ, cần tích cực phát biểu hơn' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  selfComment?: string;
}

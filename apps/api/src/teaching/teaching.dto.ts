import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DutyKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải theo dạng YYYY-MM-DD';
/** Periods a week, in half periods: 1, 1,5, 2 ... */
const PERIODS = { maxDecimalPlaces: 1 };

export class SemesterQuery {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @IsIn([1, 2]) semester: number;
  @ApiPropertyOptional() @IsOptional() @IsString() academicYearId?: string;
}

export class AssignmentQuery extends SemesterQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
}

export class AssignedTeacherDto {
  @ApiProperty() @IsString() @IsNotEmpty() teacherId: string;

  @ApiProperty({ example: 4, description: 'Số tiết/tuần' })
  @Type(() => Number)
  @IsNumber(PERIODS)
  @Min(0.5)
  @Max(40)
  periodsPerWeek: number;
}

/** Who teaches one subject in one class in a semester; an empty list clears it. */
export class AssignmentCellDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiProperty() @IsString() @IsNotEmpty() subjectId: string;
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @IsIn([1, 2]) semester: number;

  @ApiProperty({ type: [AssignedTeacherDto] })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AssignedTeacherDto)
  teachers: AssignedTeacherDto[];
}

export class FromTimetableDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @IsIn([1, 2]) semester: number;
}

export class CopyAssignmentsDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @IsIn([1, 2]) from: number;
  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @IsIn([1, 2]) to: number;
}

export class YearQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() academicYearId?: string;
}

export class HomeroomItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiPropertyOptional({ nullable: true, description: 'null: chưa phân công' }) @IsOptional() @IsString() teacherId?: string | null;
}

export class SaveHomeroomDto {
  @ApiProperty({ type: [HomeroomItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => HomeroomItemDto)
  items: HomeroomItemDto[];
}

export class DutyTypeDto {
  @ApiProperty({ example: 'TTCM' }) @IsString() @IsNotEmpty() @MaxLength(20) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã chỉ gồm chữ không dấu, số, - và _' }) code: string;
  @ApiProperty({ example: 'Tổ trưởng chuyên môn' }) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ enum: DutyKind }) @IsEnum(DutyKind) kind: DutyKind;

  @ApiProperty({ example: 3, description: 'Định mức riêng (chức vụ) hoặc số tiết được giảm mỗi tuần' })
  @Type(() => Number)
  @IsNumber(PERIODS)
  @Min(0)
  @Max(40)
  periods: number;

  @ApiPropertyOptional({ example: 'Điều 9 Thông tư 05/2025/TT-BGDĐT' }) @IsOptional() @IsString() @MaxLength(300) basis?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateDutyTypeDto extends PartialType(DutyTypeDto) {}

export class DutyQuery extends YearQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
}

export class TeacherDutyDto {
  @ApiProperty() @IsString() @IsNotEmpty() teacherId: string;
  @ApiProperty() @IsString() @IsNotEmpty() dutyTypeId: string;
  @ApiPropertyOptional({ description: '1 hoặc 2; bỏ trống: cả năm học' }) @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2]) semester?: number | null;

  @ApiPropertyOptional({ example: 6, description: 'Thay số tiết của danh mục cho giáo viên này' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(PERIODS)
  @Min(0)
  @Max(40)
  periods?: number | null;

  @ApiPropertyOptional({ example: 'Tổ Toán - Khoa học tự nhiên' }) @IsOptional() @IsString() @MaxLength(200) note?: string | null;
}

export class UpdateTeacherDutyDto extends PartialType(TeacherDutyDto) {}

export class WorkloadSettingDto {
  @ApiProperty({ example: 19 }) @Type(() => Number) @IsNumber(PERIODS) @Min(1) @Max(40) teacherNorm: number;
  @ApiProperty({ example: 4 }) @Type(() => Number) @IsNumber(PERIODS) @Min(0) @Max(20) homeroomReduction: number;
}

export class CalendarQuery {
  @ApiPropertyOptional({ description: 'Bỏ trống: giáo viên đang đăng nhập' }) @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Một ngày bất kỳ trong tuần' }) @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) date?: string;
}

export class LessonPlanEntryDto {
  @ApiProperty({ example: '2026-10-05' }) @Matches(DATE, { message: DATE_MESSAGE }) date: string;
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(20) periodNumber: number;
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiProperty() @IsString() @IsNotEmpty() subjectId: string;
  @ApiPropertyOptional({ example: 18, description: 'Tiết theo kế hoạch dạy học' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) lessonNo?: number | null;
  @ApiProperty({ example: 'Bài 9. Dấu hiệu chia hết', description: 'Để trống để xóa tiết khỏi lịch báo giảng' }) @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional({ example: 'Máy chiếu, phiếu học tập' }) @IsOptional() @IsString() @MaxLength(300) aids?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

export class SaveCalendarDto {
  @ApiPropertyOptional({ description: 'Bỏ trống: giáo viên đang đăng nhập' }) @IsOptional() @IsString() teacherId?: string;

  @ApiProperty({ type: [LessonPlanEntryDto] })
  @IsArray()
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => LessonPlanEntryDto)
  entries: LessonPlanEntryDto[];
}

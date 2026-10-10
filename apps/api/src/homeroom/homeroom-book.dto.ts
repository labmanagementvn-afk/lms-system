import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StudentNoteKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải theo dạng YYYY-MM-DD';
const TEXT = 5000;

export class BookQuery {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
}

export class OfficerDto {
  @ApiProperty({ example: 'Lớp trưởng' }) @IsString() @IsNotEmpty() @MaxLength(60) role: string;
  @ApiProperty() @IsString() @IsNotEmpty() studentId: string;
}

export class CommitteeMemberDto {
  @ApiProperty({ example: 'Trưởng ban' }) @IsString() @IsNotEmpty() @MaxLength(60) role: string;
  @ApiProperty({ description: 'Phụ huynh của một học sinh trong lớp' }) @IsString() @IsNotEmpty() guardianId: string;
}

export class GroupDto {
  @ApiProperty({ example: 'Tổ 1' }) @IsString() @IsNotEmpty() @MaxLength(40) name: string;
  @ApiPropertyOptional({ description: 'Tổ trưởng, một thành viên của tổ' }) @IsOptional() @IsString() leaderId?: string | null;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) studentIds: string[];
}

/** Sơ đồ chỗ ngồi: rows of desks from the board back, in columns (dãy), each desk with its seats. */
export class SeatingDto {
  @ApiProperty({ example: 4, description: 'Số dãy bàn' }) @Type(() => Number) @IsInt() @Min(1) @Max(6) columns: number;
  @ApiProperty({ example: 5, description: 'Số bàn mỗi dãy' }) @Type(() => Number) @IsInt() @Min(1) @Max(12) rows: number;
  @ApiProperty({ example: 2, description: 'Số chỗ mỗi bàn' }) @Type(() => Number) @IsInt() @Min(1) @Max(4) seatsPerDesk: number;

  @ApiProperty({ description: 'seats[row][column * seatsPerDesk + seat]: a student id or null', type: 'array', items: { type: 'array', items: { type: 'string', nullable: true } } })
  @IsArray()
  @ArrayMaxSize(12)
  seats: (string | null)[][];
}

export class YearPlanDto {
  @ApiPropertyOptional({ description: 'Đặc điểm tình hình lớp' }) @IsOptional() @IsString() @MaxLength(TEXT) situation?: string;
  @ApiPropertyOptional({ description: 'Mục tiêu giáo dục' }) @IsOptional() @IsString() @MaxLength(TEXT) goals?: string;
  @ApiPropertyOptional({ description: 'Chỉ tiêu phấn đấu' }) @IsOptional() @IsString() @MaxLength(TEXT) targets?: string;
  @ApiPropertyOptional({ description: 'Biện pháp thực hiện' }) @IsOptional() @IsString() @MaxLength(TEXT) measures?: string;
}

/** Any part of the book; parts left out stay as they are. */
export class SaveBookDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;

  @ApiPropertyOptional({ type: [OfficerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OfficerDto)
  officers?: OfficerDto[];

  @ApiPropertyOptional({ type: [CommitteeMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => CommitteeMemberDto)
  parentCommittee?: CommitteeMemberDto[];

  @ApiPropertyOptional({ type: [GroupDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GroupDto)
  groups?: GroupDto[];

  @ApiPropertyOptional({ type: SeatingDto, nullable: true, description: 'null xóa sơ đồ' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => SeatingDto)
  seating?: SeatingDto | null;

  @ApiPropertyOptional({ type: YearPlanDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => YearPlanDto)
  yearPlan?: YearPlanDto;
}

export class MonthPlanDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiProperty({ example: '2026-10' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng phải theo dạng YYYY-MM' }) month: string;
  @ApiPropertyOptional({ example: 'Tháng 10: Chăm ngoan, học giỏi' }) @IsOptional() @IsString() @MaxLength(200) theme?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Nhập nội dung kế hoạch' }) @MaxLength(TEXT) tasks: string;
  @ApiPropertyOptional({ description: 'Đánh giá cuối tháng' }) @IsOptional() @IsString() @MaxLength(TEXT) review?: string | null;
}

export class MeetingDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiProperty({ example: '2026-09-20' }) @Matches(DATE, { message: DATE_MESSAGE }) date: string;
  @ApiProperty({ example: 'Họp cha mẹ học sinh đầu năm học' }) @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) attended?: number | null;
  @ApiPropertyOptional({ example: 11 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) invited?: number | null;
  @ApiProperty({ description: 'Nội dung cuộc họp' }) @IsString() @IsNotEmpty({ message: 'Nhập nội dung cuộc họp' }) @MaxLength(TEXT) content: string;
  @ApiPropertyOptional({ description: 'Ý kiến của cha mẹ học sinh' }) @IsOptional() @IsString() @MaxLength(TEXT) opinions?: string | null;
  @ApiPropertyOptional({ description: 'Kết luận' }) @IsOptional() @IsString() @MaxLength(TEXT) conclusions?: string | null;
}

export class UpdateMeetingDto extends PartialType(MeetingDto) {}

export class StudentNoteDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiProperty() @IsString() @IsNotEmpty() studentId: string;
  @ApiProperty({ example: '2026-10-05' }) @Matches(DATE, { message: DATE_MESSAGE }) date: string;
  @ApiProperty({ enum: StudentNoteKind }) @IsEnum(StudentNoteKind) kind: StudentNoteKind;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Nhập nội dung theo dõi' }) @MaxLength(2000) content: string;
  @ApiPropertyOptional({ description: 'Biện pháp giáo dục, giúp đỡ' }) @IsOptional() @IsString() @MaxLength(2000) action?: string | null;
  @ApiPropertyOptional({ description: 'Kết quả' }) @IsOptional() @IsString() @MaxLength(2000) result?: string | null;
}

export class UpdateStudentNoteDto extends PartialType(StudentNoteDto) {}

export class BookReviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() classId: string;
  @ApiPropertyOptional({ example: '2026-10-02', description: 'Bỏ trống: hôm nay' }) @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) date?: string;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Nhập ý kiến' }) @MaxLength(2000) content: string;
}

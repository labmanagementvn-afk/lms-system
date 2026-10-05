import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HomeroomStatus, LessonLogStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải theo dạng YYYY-MM-DD';

// ---- Homeroom attendance (điểm danh lớp) ----

export class AttendanceQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Mặc định là hôm nay' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;
}

export class AttendanceRecordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ enum: HomeroomStatus })
  @IsEnum(HomeroomStatus)
  status: HomeroomStatus;

  @ApiPropertyOptional({ example: 'Phụ huynh báo ốm' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class SaveAttendanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: '2026-10-05' })
  @Matches(DATE, { message: DATE_MESSAGE })
  date: string;

  @ApiProperty({ type: [AttendanceRecordDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

export class PrefillAttendanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: '2026-10-05' })
  @Matches(DATE, { message: DATE_MESSAGE })
  date: string;
}

export class MonthlyAttendanceQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: '2026-10' })
  @Matches(MONTH, { message: 'Tháng phải theo dạng YYYY-MM' })
  month: string;
}

export class DailyAttendanceQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Mặc định là hôm nay' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;
}

// ---- Lesson logbook (sổ đầu bài) ----

export class LogbookQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Mặc định là thứ Hai tuần này' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-10', description: 'Tối đa 14 ngày kể từ "from"' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  to?: string;
}

export class SaveLessonLogDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: '2026-10-05' })
  @Matches(DATE, { message: DATE_MESSAGE })
  date: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(20)
  periodNumber: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiPropertyOptional({ example: 1, description: 'Mặc định suy ra từ ngày' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semester?: number;

  @ApiProperty({ example: 'Bài 3: Phân số' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ example: 'Lớp học sôi nổi' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: 9, description: 'Xếp loại tiết học 1-10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number;

  @ApiProperty({ enum: LessonLogStatus })
  @IsEnum(LessonLogStatus)
  status: LessonLogStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  absentStudentIds?: string[];

  @ApiPropertyOptional({ description: 'Chỉ ADMIN/STAFF: giáo viên dạy tiết này (mặc định theo thời khóa biểu)' })
  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class LogbookStatsQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Mặc định đầu tháng này' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Mặc định hôm nay' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  to?: string;
}

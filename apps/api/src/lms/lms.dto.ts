import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CourseStatus, LessonType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

// ---- Courses ----

export class CourseQuery extends PageQuery {
  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gradeLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Chỉ khóa học của giáo viên đang đăng nhập' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}

export class CreateCourseDto {
  @ApiProperty({ example: 'Toán 6 – Số tự nhiên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

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

  @ApiPropertyOptional({ description: 'Mặc định năm học hiện tại' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Lớp được học; để trống = toàn trường' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ description: 'Chỉ ADMIN/STAFF; giáo viên luôn là chủ khóa học của mình' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverFileId?: string;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class SectionDto {
  @ApiProperty({ example: 'Chương 1: Số tự nhiên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}

export class CreateLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ example: 'Bài 1: Tập hợp' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: LessonType })
  @IsEnum(LessonType)
  type: LessonType;

  @ApiPropertyOptional({ description: 'Nội dung bài đọc (TEXT)' })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @ApiPropertyOptional({ description: 'Tệp đã tải lên (VIDEO, DOCUMENT, SCORM)' })
  @IsOptional()
  @IsString()
  fileId?: string;

  @ApiPropertyOptional({ description: 'Đường dẫn (VIDEO YouTube, LINK, H5P)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ description: 'Bài kiểm tra (QUIZ)' })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  durationMin?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class ReorderSectionDto {
  @ApiPropertyOptional({ description: 'null = bài học chưa phân mục', nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  lessonIds: string[];
}

export class ReorderDto {
  @ApiProperty({ type: [ReorderSectionDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReorderSectionDto)
  sections: ReorderSectionDto[];
}

export class EnrolStudentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  studentIds: string[];
}

// ---- Discussions ----

export class CreateThreadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;

  @ApiPropertyOptional({ description: 'Bài học được thảo luận' })
  @IsOptional()
  @IsString()
  lessonId?: string;
}

export class CreatePostDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;
}

export class UpdateThreadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

// ---- Live classes ----

export class LiveQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateLiveDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 'Ôn tập chương 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: '2026-10-06T12:30:00Z' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  durationMin?: number;
}

// ---- Student app ----

export class ProgressDto {
  @ApiPropertyOptional({ description: 'Số giây học thêm (cộng dồn)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  secondsSpent?: number;

  @ApiPropertyOptional({ enum: ['IN_PROGRESS', 'COMPLETED'] })
  @IsOptional()
  @IsIn(['IN_PROGRESS', 'COMPLETED'])
  status?: 'IN_PROGRESS' | 'COMPLETED';

  @ApiPropertyOptional({ description: 'Dữ liệu cmi.* của gói SCORM' })
  @IsOptional()
  @IsObject()
  scormData?: Record<string, unknown>;
}

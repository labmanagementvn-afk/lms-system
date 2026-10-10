import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const SEMESTER_MESSAGE = 'Học kỳ phải là 1 hoặc 2';
const TERM_MESSAGE = 'Học kỳ phải là 0 (cả năm), 1 hoặc 2';
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class SemesterOnlyQuery {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;
}

// ---- Column locks ----

export class ColumnLockQuery extends SemesterOnlyQuery {
  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;
}

export class ColumnLockDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;

  @ApiProperty({ example: 9, description: 'Khối' })
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel: number;

  @ApiPropertyOptional({ description: 'Bỏ trống để khóa cột ở mọi môn' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ enum: ScoreKind })
  @IsEnum(ScoreKind)
  kind: ScoreKind;

  @ApiPropertyOptional({ example: 0, description: 'Cột thường xuyên thứ n; 0 = mọi cột thường xuyên' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  index?: number;
}

// ---- Entry window ----

export class EntryWindowDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsIn([1, 2], { message: SEMESTER_MESSAGE })
  semester: number;

  @ApiPropertyOptional({ example: '2026-09-05T00:00:00+07:00', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  opensAt?: string | null;

  @ApiPropertyOptional({ example: '2027-01-15T23:59:59+07:00', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  closesAt?: string | null;

  @ApiPropertyOptional({ example: 2, nullable: true, description: 'Số lần giáo viên được sửa một điểm đã nhập; bỏ trống = không giới hạn' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(50)
  maxEdits?: number | null;
}

// ---- Exemptions ----

export class ExemptionQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}

export class ExemptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 0, description: '0 = cả năm, 1 hoặc 2 = một học kỳ' })
  @IsInt()
  @IsIn([0, 1, 2], { message: TERM_MESSAGE })
  semester: number;

  @ApiPropertyOptional({ example: 'Giấy xác nhận của bệnh viện' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ---- Visibility ----

export class VisibilityDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() regularMarks?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() examMarks?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() averages?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() termResults?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() titles?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() absences?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeroomComment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() teacherNotes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onlyAfterLock?: boolean;
}

// ---- Monitoring and edit log ----

export class MonitorQuery extends SemesterOnlyQuery {
  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class MissingQuery extends SemesterOnlyQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;
}

export class EditLogQuery extends SemesterOnlyQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Chỉ những lần sửa một điểm đã có giá trị' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  changesOnly?: boolean;
}

export class ImportBookQuery extends SemesterOnlyQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Chỉ kiểm tra, không lưu' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dryRun?: boolean;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResultLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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

const ROUND_MESSAGE = 'Đợt xét phải là 1 hoặc 2';

/** Which students a review list shows: a class, a grade level, or the whole school. */
export class ReviewScopeQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;
}

export class RegisterAllDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;
}

export class RetakeSubjectsDto {
  @ApiProperty({ type: [String], description: 'Every subject the student retakes; subjects left out are unregistered' })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  subjectIds: string[];
}

export class RetakeResultDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  retakeId: string;

  @ApiPropertyOptional({ example: 6.5, nullable: true, description: 'Score subjects; null clears the mark' })
  @IsOptional()
  @ValidateIf((o) => o.score !== null)
  @IsNumber()
  score?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Comment subjects: Đạt (true) or Chưa đạt (false); null clears it' })
  @IsOptional()
  @ValidateIf((o) => o.passed !== null)
  @IsBoolean()
  passed?: boolean | null;

  @ApiPropertyOptional({ example: 'Vắng thi, có giấy phép', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.note !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class RetakeResultsDto {
  @ApiProperty({ type: [RetakeResultDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RetakeResultDto)
  entries: RetakeResultDto[];
}

export class TrainingDto {
  @ApiProperty({ example: 'Tham gia lao động vệ sinh khu dân cư 2 buổi/tuần; viết bản tự kiểm điểm có xác nhận của gia đình.' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập nhiệm vụ rèn luyện' })
  @MaxLength(2000)
  tasks: string;

  @ApiPropertyOptional({ enum: ResultLevel, nullable: true, description: 'Kết quả rèn luyện cả năm sau khi đánh giá lại; null = chưa đánh giá' })
  @IsOptional()
  @ValidateIf((o) => o.result !== null)
  @IsEnum(ResultLevel)
  result?: ResultLevel | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.comment !== null)
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

// ---- THCS completion ----

export class RoundQuery {
  @ApiPropertyOptional({ example: 1, description: '1: trước khi kết thúc năm học; 2: trước khi khai giảng năm học mới' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2], { message: ROUND_MESSAGE })
  round?: number;
}

export class CompletionQuery extends RoundQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

export class CouncilMemberDto {
  @ApiProperty({ example: 'Nguyễn Thị Hồng Hạnh' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập họ tên thành viên' })
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Hiệu trưởng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @ApiProperty({ example: 'Chủ tịch', description: 'Chủ tịch, Phó Chủ tịch, Thư ký hoặc Ủy viên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  role: string;
}

export class CouncilDto {
  @ApiPropertyOptional({ example: '15/QĐ-THCS', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.councilDecisionNo !== null)
  @IsString()
  @MaxLength(50)
  councilDecisionNo?: string | null;

  @ApiPropertyOptional({ example: '2027-05-05', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.councilDecidedOn !== null)
  @IsDateString()
  councilDecidedOn?: string | null;

  @ApiPropertyOptional({ example: '2027-05-18T08:00:00+07:00', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.meetingAt !== null)
  @IsDateString()
  meetingAt?: string | null;

  @ApiPropertyOptional({ example: 'Phòng họp Hội đồng sư phạm', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.meetingPlace !== null)
  @IsString()
  @MaxLength(200)
  meetingPlace?: string | null;

  @ApiPropertyOptional({ type: [CouncilMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CouncilMemberDto)
  members?: CouncilMemberDto[];
}

export class CompletionStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dossierComplete?: boolean;

  @ApiPropertyOptional({ example: 'Con thương binh', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.priority !== null)
  @IsString()
  @MaxLength(200)
  priority?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.note !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class RecognizeDto {
  @ApiProperty({ example: '01/QĐ-HĐXCN' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập số quyết định' })
  @MaxLength(50)
  decisionNo: string;

  @ApiProperty({ example: '2027-05-20' })
  @IsDateString()
  decidedOn: string;

  @ApiPropertyOptional({ example: 'Chủ tịch Hội đồng', description: 'Mặc định: Chủ tịch Hội đồng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerTitle?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Thị Hồng Hạnh', description: 'Mặc định: chủ tịch trong danh sách hội đồng, hoặc hiệu trưởng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerName?: string;
}

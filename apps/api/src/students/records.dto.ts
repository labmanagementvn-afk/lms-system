import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AwardForm, DisciplineMeasure, MovementKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày không hợp lệ';

/** Students picked on the list; every bulk action takes up to 200 at once. */
export class StudentIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một học sinh' })
  @ArrayMaxSize(200)
  @IsString({ each: true })
  studentIds: string[];
}

export class MoveClassDto extends StudentIdsDto {
  @ApiProperty({ description: 'A class of the same grade and school year' })
  @IsString()
  @IsNotEmpty()
  toClassId: string;

  @ApiPropertyOptional({ example: '2026-11-02', description: 'Today by default' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiPropertyOptional({ example: 'Theo nguyện vọng của gia đình' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class TransferOutDto extends StudentIdsDto {
  @ApiPropertyOptional({ example: '2026-11-02' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiProperty({ example: 'Trường THCS Nguyễn Du, phường Hoàn Kiếm, Hà Nội' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập trường chuyển đến' })
  @MaxLength(255)
  otherSchool: string;

  @ApiPropertyOptional({ example: 'Gia đình chuyển nơi ở' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({ example: '15/GGT-THCS' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentNo?: string;
}

export class DropOutDto extends StudentIdsDto {
  @ApiPropertyOptional({ example: '2026-11-02' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiProperty({ example: 'Hoàn cảnh gia đình khó khăn' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do thôi học' })
  @MaxLength(255)
  reason: string;
}

export class ReadmitDto {
  @ApiProperty({ description: 'The class the student returns to' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '2027-01-04' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class MovementQuery {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) to?: string;
  @ApiPropertyOptional({ enum: MovementKind }) @IsOptional() @IsEnum(MovementKind) kind?: MovementKind;
  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;
}

export class AwardDto extends StudentIdsDto {
  @ApiProperty({ enum: AwardForm })
  @IsEnum(AwardForm)
  form: AwardForm;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiProperty({ example: 'Đạt giải Nhì cuộc thi Hùng biện tiếng Anh cấp phường' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập thành tích' })
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional({ example: 'UBND phường Cầu Giấy' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuer?: string;

  @ApiPropertyOptional({ example: '25/QĐ-THCS' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  decisionNo?: string;

  @ApiPropertyOptional({ default: true, description: 'Tell the parents in their app' })
  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;
}

export class DisciplineDto extends StudentIdsDto {
  @ApiProperty({ enum: DisciplineMeasure })
  @IsEnum(DisciplineMeasure)
  measure: DisciplineMeasure;

  @ApiProperty({ minimum: 1, maximum: 3, description: 'Mức độ vi phạm (Điều 12)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  severity: number;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiProperty({ example: 'Sử dụng điện thoại trong giờ học' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập hành vi vi phạm' })
  @MaxLength(500)
  violation: string;

  @ApiPropertyOptional({ description: 'Hoạt động hỗ trợ (Điều 16)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  support?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;
}

export class UpdateDisciplineDto {
  @ApiPropertyOptional({ description: 'Hoạt động hỗ trợ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  support?: string | null;

  @ApiPropertyOptional({ description: 'The family returned the self-review confirmed and signed' })
  @IsOptional()
  @IsBoolean()
  familyConfirmed?: boolean;
}

export class MeritQuery {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;
}

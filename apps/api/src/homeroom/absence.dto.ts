import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AbsenceRequestStatus, Session } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải theo dạng YYYY-MM-DD';

/** Đơn xin nghỉ học, as a parent sends it from the app. */
export class AbsenceRequestDto {
  @ApiProperty({ example: '2026-10-12' })
  @Matches(DATE, { message: DATE_MESSAGE })
  fromDate: string;

  @ApiProperty({ example: '2026-10-13' })
  @Matches(DATE, { message: DATE_MESSAGE })
  toDate: string;

  @ApiPropertyOptional({ enum: Session, description: 'Bỏ trống: nghỉ cả ngày' })
  @IsOptional()
  @IsEnum(Session)
  session?: Session;

  @ApiProperty({ example: 'Con bị sốt, gia đình xin cho con nghỉ để đi khám' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do xin nghỉ' })
  @MaxLength(500)
  reason: string;
}

/** A request the homeroom teacher writes down from a call or a paper note; it is approved at once. */
export class RecordAbsenceDto extends AbsenceRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;
}

export class DecideAbsenceDto {
  @ApiProperty({ description: 'true: duyệt, false: không duyệt' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'Đề nghị gia đình bổ sung giấy khám bệnh' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AbsenceQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional({ enum: AbsenceRequestStatus }) @IsOptional() @IsEnum(AbsenceRequestStatus) status?: AbsenceRequestStatus;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Đơn có ngày nghỉ từ ngày này' }) @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @Matches(DATE, { message: DATE_MESSAGE }) to?: string;
}

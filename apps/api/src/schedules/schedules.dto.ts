import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Session } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PeriodDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(20)
  number: number;

  @ApiProperty({ enum: Session })
  @IsEnum(Session)
  session: Session;

  @ApiProperty({ example: '07:00' })
  @Matches(HHMM)
  startTime: string;

  @ApiProperty({ example: '07:45' })
  @Matches(HHMM)
  endTime: string;
}

export class ReplacePeriodsDto {
  @ApiProperty({ type: [PeriodDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodDto)
  periods: PeriodDto[];
}

export class TimetableQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Defaults to the current academic year' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  semester = 1;
}

export class TimetableEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  teacherId: string;

  @ApiProperty({ example: 1, description: 'Học kỳ 1 hoặc 2' })
  @IsInt()
  @Min(1)
  @Max(2)
  semester: number;

  @ApiProperty({ example: 2, description: '1 = Thứ Hai ... 7 = Chủ Nhật' })
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  periodNumber: number;

  @ApiPropertyOptional({ example: 'P.201' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  room?: string;
}

export class UpdateTimetableEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  room?: string | null;
}

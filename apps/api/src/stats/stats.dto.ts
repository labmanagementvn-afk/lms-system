import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AlertKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class RangeQuery {
  @ApiPropertyOptional({ example: '2026-09-22', description: 'School-local date; defaults to 13 days before `to`' })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Inclusive; defaults to today' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
}

export class DaysQuery {
  @ApiPropertyOptional({ default: 14, description: 'Window length in days ending today' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(93)
  days = 14;
}

export class DateQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'School-local date; defaults to today' })
  @IsOptional()
  @Matches(DATE)
  date?: string;
}

export class RecomputeDto {
  @ApiProperty({ example: '2026-09-22' })
  @Matches(DATE)
  from: string;

  @ApiProperty({ example: '2026-10-05', description: 'Inclusive, at most 62 days after `from`' })
  @Matches(DATE)
  to: string;
}

export class CreateAlertRuleDto {
  @ApiProperty({ enum: AlertKind })
  @IsEnum(AlertKind)
  kind: AlertKind;

  @ApiProperty({ example: 'Chuyên cần dưới 90%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 90, description: 'Percent, VND, count or streak length depending on the kind' })
  @IsNumber()
  @Min(0)
  @Max(1e12)
  threshold: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAlertRuleDto extends PartialType(CreateAlertRuleDto) {}

export class AlertEventQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'true = only unacknowledged, false = only acknowledged' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  open?: boolean;

  @ApiPropertyOptional({ enum: AlertKind })
  @IsOptional()
  @IsEnum(AlertKind)
  kind?: AlertKind;

  @ApiPropertyOptional({ description: 'District routes only: one school' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({ example: '2026-09-22' })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
}

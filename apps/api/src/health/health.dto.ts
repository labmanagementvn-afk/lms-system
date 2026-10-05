import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IncidentSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';
import { INSURANCE_NUMBER } from './health-rules';

export class HealthProfileDto {
  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  bloodType?: string;

  @ApiPropertyOptional({ example: 'Dị ứng hải sản' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergies?: string;

  @ApiPropertyOptional({ example: 'Hen suyễn' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  chronicConditions?: string;

  @ApiPropertyOptional({ example: 'HS4797923456789', description: 'Mã thẻ BHYT (10 hoặc 15 ký tự)' })
  @IsOptional()
  @Matches(INSURANCE_NUMBER, { message: 'Mã thẻ BHYT phải gồm 10 hoặc 15 chữ/số' })
  insuranceNumber?: string;

  @ApiPropertyOptional({ example: '2027-09-30' })
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class HealthCheckDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  checkedAt: string;

  @ApiPropertyOptional({ example: 140 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  heightCm?: number;

  @ApiPropertyOptional({ example: 35.5 })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(250)
  weightKg?: number;

  @ApiPropertyOptional({ example: '10/10' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  visionLeft?: string;

  @ApiPropertyOptional({ example: '9/10' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  visionRight?: string;

  @ApiPropertyOptional({ example: 'Sâu răng R36' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dental?: string;

  @ApiPropertyOptional({ example: 'Sức khỏe loại I' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  conclusion?: string;
}

export class UpdateHealthCheckDto extends PartialType(OmitType(HealthCheckDto, ['studentId'] as const)) {}

export class HealthCheckQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class VaccinationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: 'Sởi - Rubella (MR)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  vaccine: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  dose?: number;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  givenAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class IncidentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: '2026-10-05T03:15:00.000Z' })
  @IsDateString()
  occurredAt: string;

  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;

  @ApiProperty({ example: 'Ngã trong giờ ra chơi, trầy đầu gối' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ example: 'Sát trùng, băng vết thương' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  treatment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  guardianNotified?: boolean;
}

export class UpdateIncidentDto extends PartialType(OmitType(IncidentDto, ['studentId'] as const)) {}

export class IncidentQuery extends PageQuery {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'School-local date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: IncidentSeverity })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}

export class InsuranceQuery extends PageQuery {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  days = 30;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

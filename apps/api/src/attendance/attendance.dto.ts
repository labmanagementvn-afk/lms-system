import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DeviceType, Direction, EventMethod, IdentityMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- Devices ----

export class CreateDeviceDto {
  @ApiProperty({ example: 'Cổng chính - làn vào' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: DeviceType })
  @IsEnum(DeviceType)
  type: DeviceType;

  @ApiPropertyOptional({ example: 'ZKTeco' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendor?: string;

  @ApiPropertyOptional({ description: 'Serial number; required for ZKTeco ADMS push' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'Cổng chính' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ enum: Direction, description: 'Used when the terminal does not report in/out' })
  @IsOptional()
  @IsEnum(Direction)
  defaultDirection?: Direction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}

// ---- Identities ----

export class CreateIdentityDto {
  @ApiProperty({ enum: IdentityMethod })
  @IsEnum(IdentityMethod)
  method: IdentityMethod;

  @ApiProperty({ example: '1001', description: 'Person ID on the terminal, or the card number / QR payload' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ example: 'Trần Văn Nam', description: 'Required for BIOMETRIC: who gave consent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  consentGivenBy?: string;

  @ApiPropertyOptional({ example: 'Cha' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  consentRelationship?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Required for BIOMETRIC' })
  @IsOptional()
  @IsDateString()
  consentAt?: string;

  @ApiPropertyOptional({ example: 'Phiếu đồng ý số 12/2026' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consentReference?: string;
}

export class IdentityQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ enum: IdentityMethod })
  @IsOptional()
  @IsEnum(IdentityMethod)
  method?: IdentityMethod;
}

// ---- Ingestion (generic JSON API for terminals and bridges) ----

export class IngestEventDto {
  @ApiPropertyOptional({ example: 'evt-000123', description: 'Unique per device; makes retries safe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventId?: string;

  @ApiProperty({ example: '1001', description: 'Person ID on the terminal, or card number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  personId: string;

  @ApiProperty({ example: '2026-10-05T07:02:11+07:00', description: 'ISO 8601; without offset it is read as school-local time' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)
  occurredAt: string;

  @ApiPropertyOptional({ enum: EventMethod })
  @IsOptional()
  @IsEnum(EventMethod)
  method?: EventMethod;

  @ApiPropertyOptional({ enum: Direction })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional({ description: 'Original vendor payload, stored for troubleshooting' })
  @IsOptional()
  raw?: unknown;
}

export class IngestDto {
  @ApiProperty({ type: [IngestEventDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];
}

// ---- Manual entry and reports ----

export class ManualEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiProperty({ enum: [Direction.IN, Direction.OUT] })
  @IsIn([Direction.IN, Direction.OUT])
  direction: Direction;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'Quên thẻ, bảo vệ xác nhận' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class EventsQuery extends PageQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'School-local date; defaults to today' })
  @IsOptional()
  @Matches(DATE)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Only events not linked to a student or teacher' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unmatched?: boolean;
}

export class DailyQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'School-local date; defaults to today' })
  @IsOptional()
  @Matches(DATE)
  date?: string;

  @ApiPropertyOptional({ description: 'Limit to one class (students only)' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ enum: ['STUDENT', 'TEACHER'], default: 'STUDENT' })
  @IsOptional()
  @IsIn(['STUDENT', 'TEACHER'])
  personType: 'STUDENT' | 'TEACHER' = 'STUDENT';
}

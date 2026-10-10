import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoetExportKind, MoetSyncStatus, MoetTarget } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ExportQuery extends PageQuery {
  @ApiPropertyOptional({ enum: MoetExportKind })
  @IsOptional()
  @IsEnum(MoetExportKind)
  kind?: MoetExportKind;
}

export class CreateExportDto {
  @ApiProperty({ enum: MoetExportKind })
  @IsEnum(MoetExportKind)
  kind: MoetExportKind;

  @ApiPropertyOptional({ description: 'Defaults to the current academic year' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ description: 'TERM_RESULTS only: 1, 2 or 0 for the whole year', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  semester?: number;
}

export class ImportStudentsDto {
  @ApiProperty({ description: 'CSV text in the MOET student template (see GET /moet/import/students/template)' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung CSV trống' })
  @MaxLength(5_000_000)
  csv: string;

  @ApiPropertyOptional({ description: 'Validate and count only', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class SyncDto extends CreateExportDto {
  @ApiProperty({ enum: MoetTarget, description: 'MOET: CSDL ngành of the ministry; PROVINCE: the Sở GD&ĐT database' })
  @IsEnum(MoetTarget)
  target: MoetTarget;

  @ApiProperty({ example: '79000701', description: 'The school account on the education database' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập tên đăng nhập' })
  @MaxLength(100)
  username: string;

  @ApiProperty({ description: 'Used for this submission only; never stored or logged' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập mật khẩu' })
  @MaxLength(200)
  password: string;
}

export class SyncQuery extends PageQuery {
  @ApiPropertyOptional({ enum: MoetTarget })
  @IsOptional()
  @IsEnum(MoetTarget)
  target?: MoetTarget;

  @ApiPropertyOptional({ enum: MoetExportKind })
  @IsOptional()
  @IsEnum(MoetExportKind)
  kind?: MoetExportKind;

  @ApiPropertyOptional({ enum: MoetSyncStatus })
  @IsOptional()
  @IsEnum(MoetSyncStatus)
  status?: MoetSyncStatus;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: '6A1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @ApiProperty({ example: 6, description: 'Khối 1-12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel: number;

  @ApiPropertyOptional({ description: 'Defaults to the current academic year' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ description: 'Giáo viên chủ nhiệm' })
  @IsOptional()
  @IsString()
  homeroomTeacherId?: string | null;

  @ApiPropertyOptional({ example: 'P.201' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  room?: string;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

export class ClassQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gradeLevel?: number;
}

export class EnrollDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  studentIds: string[];
}

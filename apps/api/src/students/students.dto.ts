import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Gender, GuardianRelationship, StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

export class GuardianDto {
  @ApiProperty({ example: 'Trần Văn Nam' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ enum: GuardianRelationship })
  @IsEnum(GuardianRelationship)
  relationship: GuardianRelationship;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateStudentDto {
  @ApiProperty({ example: 'HS2026001', description: 'Mã học sinh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Trần Minh Anh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '2014-03-21' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({ description: 'Enrol into this class (current academic year of the class)' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ type: [GuardianDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianDto)
  guardians?: GuardianDto[];
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class StudentQuery extends PageQuery {
  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

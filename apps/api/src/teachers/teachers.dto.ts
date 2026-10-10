import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Gender, TeacherStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class CreateTeacherDto {
  @ApiProperty({ example: 'GV001', description: 'Mã giáo viên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Nguyễn Thị Lan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1988-04-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'lan.nt@demo.edu.vn' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: TeacherStatus })
  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @ApiPropertyOptional({ example: 'Tổ Toán - Khoa học tự nhiên', description: 'Tổ chuyên môn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subjectGroup?: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs of subjects the teacher teaches' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ description: 'Creates a login account (role TEACHER) using `email` when set' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {}

export class TeacherQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Tổ chuyên môn' })
  @IsOptional()
  @IsString()
  subjectGroup?: string;

  @ApiPropertyOptional({ enum: TeacherStatus })
  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class StudentAccountQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

export class CreateStudentAccountDto {
  @ApiProperty()
  @IsString()
  studentId: string;
}

export class BulkStudentAccountsDto {
  @ApiPropertyOptional({ description: 'Only students of this class; every studying student without an account otherwise' })
  @IsOptional()
  @IsString()
  classId?: string;
}

export class UpdateStudentAccountDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

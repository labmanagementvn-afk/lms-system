import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ParentAccountQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Only parents of students in this class' })
  @IsOptional()
  @IsString()
  classId?: string;
}

export class CreateParentAccountDto {
  @ApiProperty({ description: 'Guardian record the account is created for' })
  @IsString()
  @IsNotEmpty()
  guardianId: string;
}

export class BulkParentAccountsDto {
  @ApiPropertyOptional({ description: 'Limit to primary guardians of this class; omit for the whole school' })
  @IsOptional()
  @IsString()
  classId?: string;
}

export class UpdateParentAccountDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class MonthQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'Defaults to the current month' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng phải có dạng YYYY-MM' })
  month?: string;
}

export class ParentMealDto {
  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType: MealType;

  @ApiProperty({ example: ['2026-10-05', '2026-10-06'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'Ngày phải có dạng YYYY-MM-DD' })
  dates: string[];

  @ApiProperty({ enum: ['REGISTER', 'CANCEL'] })
  @IsIn(['REGISTER', 'CANCEL'])
  action: 'REGISTER' | 'CANCEL';
}

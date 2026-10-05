import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'Ngày phải có dạng YYYY-MM-DD';

export class MenuDto {
  @ApiProperty({ example: '2026-10-05' })
  @Matches(DATE, { message: DATE_MSG })
  date: string;

  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType: MealType;

  @ApiProperty({ example: ['Cơm', 'Thịt kho trứng', 'Canh rau ngót'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(120, { each: true })
  dishes: string[];

  @ApiProperty({ example: 30000, description: 'Giá suất ăn (VND)' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: '08:30', description: 'Giờ chốt đăng ký trong ngày (HH:mm)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ chốt phải có dạng HH:mm' })
  cutoff?: string;
}

export class MenuQuery {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MSG })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(DATE, { message: DATE_MSG })
  to?: string;
}

export class RegistrationDto {
  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType: MealType;

  @ApiProperty({ example: ['2026-10-05', '2026-10-06'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @Matches(DATE, { each: true, message: DATE_MSG })
  dates: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Every student enrolled in this class' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ enum: ['REGISTER', 'CANCEL'] })
  @IsIn(['REGISTER', 'CANCEL'])
  action: 'REGISTER' | 'CANCEL';
}

export class DailyQuery {
  @ApiProperty({ example: '2026-10-05' })
  @Matches(DATE, { message: DATE_MSG })
  date: string;

  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType: MealType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

export class MonthlyQuery {
  @ApiProperty({ example: '2026-10' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng phải có dạng YYYY-MM' })
  month: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;
}

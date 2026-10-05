import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../common/pagination';
import { MAX_LOAN_DAYS } from './circulation';

export class BookDto {
  @ApiProperty({ example: 'Dế Mèn phiêu lưu ký' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Tô Hoài' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  author?: string;

  @ApiPropertyOptional({ example: '9786042000000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;

  @ApiPropertyOptional({ example: 'NXB Kim Đồng' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  publisher?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 'Văn học thiếu nhi' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class UpdateBookDto extends PartialType(BookDto) {}

export class BookQuery extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class AddCopiesDto {
  @ApiProperty({ example: ['TV000123', 'TV000124'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(40, { each: true })
  barcodes: string[];

  @ApiPropertyOptional({ example: 'Kệ A2' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shelf?: string;
}

export class UpdateCopyDto {
  @ApiPropertyOptional({ enum: ['AVAILABLE', 'LOST', 'RETIRED'] })
  @IsOptional()
  @IsIn(['AVAILABLE', 'LOST', 'RETIRED'])
  status?: 'AVAILABLE' | 'LOST' | 'RETIRED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shelf?: string;
}

export class BorrowDto {
  @ApiProperty({ example: 'TV000123' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiPropertyOptional({ description: 'Exactly one of studentId / teacherId' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ default: 14, maximum: MAX_LOAN_DAYS })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_LOAN_DAYS)
  days?: number;
}

export class ReturnDto {
  @ApiProperty({ example: 'TV000123' })
  @IsString()
  @IsNotEmpty()
  barcode: string;
}

export class LoanQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['active', 'overdue', 'returned'] })
  @IsOptional()
  @IsIn(['active', 'overdue', 'returned'])
  status?: 'active' | 'overdue' | 'returned';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class ReservationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;
}

export class ReservationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}

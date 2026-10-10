import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Thông tin trường: what an admin may change about their own school. */
export class UpdateSchoolDto {
  @ApiPropertyOptional({ example: 'Trường THCS Demo' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Số 1 Trần Duy Hưng, Cầu Giấy, Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  timezone?: string;

  @ApiPropertyOptional({ example: '07:15', description: 'Students arriving after this local time are late' })
  @IsOptional()
  @Matches(HHMM, { message: 'Giờ vào học phải có dạng HH:mm' })
  lateAfter?: string;

  @ApiPropertyOptional({ description: 'Phòng/Sở GD&ĐT the school reports to; null detaches it', nullable: true })
  @IsOptional()
  @IsString()
  districtId?: string | null;

  @ApiPropertyOptional({ example: '01-0123-456', description: 'School code in the MOET education database (CSDL ngành)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  moetCode?: string;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: 'UBND phường Bình Phước', description: 'Cơ quan chủ quản, printed above the school name on reports' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  governingBody?: string;

  @ApiPropertyOptional({ example: 'Trịnh Thị Phương Mai', description: 'Principal, the default signer of reports' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  principalName?: string;

  @ApiPropertyOptional({ example: 'Đồng Nai', description: 'Place on the date line of reports ("Đồng Nai, ngày …")' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  locality?: string;
}

export class DistrictDateQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Defaults to today in the district’s timezone' })
  @IsOptional()
  @Matches(DATE)
  date?: string;
}

export class CreateOfficerDto {
  @ApiProperty({ example: 'chuyenvien@caugiay.edu.vn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'District@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdateOfficerDto extends PartialType(CreateOfficerDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DistrictSchoolsQuery extends PageQuery {}

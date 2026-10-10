import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERecordStatus, SignatureProvider } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SignatureProfileDto {
  @ApiProperty({ enum: SignatureProvider })
  @IsEnum(SignatureProvider)
  provider: SignatureProvider;

  @ApiProperty({ example: '079085001234', description: 'Số CCCD hoặc số điện thoại đăng ký dịch vụ ký số' })
  @IsString()
  @Matches(/^[A-Za-z0-9._@+-]{6,64}$/, { message: 'Tài khoản ký số là số CCCD hoặc số điện thoại' })
  account: string;
}

export class ERecordQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Chọn lớp' })
  classId: string;

  @ApiPropertyOptional({ enum: ERecordStatus })
  @IsOptional()
  @IsEnum(ERecordStatus)
  status?: ERecordStatus;
}

export class GenerateERecordsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Chọn lớp' })
  classId: string;

  @ApiPropertyOptional({ type: [String], description: 'Chỉ những học sinh này; bỏ trống là cả lớp' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  studentIds?: string[];
}

export class SignERecordsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn học bạ cần ký' })
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];
}

export class RevokeERecordDto {
  @ApiProperty({ example: 'Sai điểm môn Toán học kỳ II, đã điều chỉnh' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do thu hồi' })
  @MaxLength(500)
  reason: string;
}

export class VerifyQuery {
  @ApiProperty({ description: 'Mã tra cứu in trên học bạ' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Gender, GuardianRelationship, MovementKind, PolicyGroup, StudentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

export class GuardianDto {
  @ApiPropertyOptional({ description: 'An existing guardian of the student: updated in place, so a linked parent account keeps the child' })
  @IsOptional()
  @IsString()
  id?: string;

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

  @ApiPropertyOptional({ example: 1985 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number | null;

  @ApiPropertyOptional({ example: 'Kỹ sư' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string | null;

  @ApiPropertyOptional({ description: 'Số CCCD (12 chữ số)' })
  @IsOptional()
  @Matches(/^\d{12}$/, { message: 'Số CCCD của phụ huynh gồm 12 chữ số' })
  idNumber?: string | null;
}

/** How a new student came to the school, for the sổ đăng bộ. */
export const ENTRY_KINDS = [MovementKind.ENROLLED, MovementKind.TRANSFER_IN] as const;

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
  gender?: Gender | null;

  @ApiPropertyOptional({ example: '2014-03-21' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

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

  // ---- Phase 9: the rest of the record ----

  @ApiPropertyOptional({ description: 'Mã định danh cá nhân (12 chữ số)', example: '001214012345' })
  @IsOptional()
  @Matches(/^\d{12}$/, { message: 'Mã định danh cá nhân gồm 12 chữ số' })
  idNumber?: string | null;

  @ApiPropertyOptional({ description: 'Mã học sinh trên CSDL ngành' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  moetCode?: string | null;

  @ApiPropertyOptional({ example: 'Bệnh viện Phụ sản Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  birthPlace?: string | null;

  @ApiPropertyOptional({ example: 'Xã Thanh Lâm, tỉnh Ninh Bình' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hometown?: string | null;

  @ApiPropertyOptional({ example: 'Kinh' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ethnicity?: string | null;

  @ApiPropertyOptional({ example: 'Không' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  religion?: string | null;

  @ApiPropertyOptional({ example: 'Việt Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nationality?: string | null;

  @ApiPropertyOptional({ example: 'Phường Cầu Giấy' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentWard?: string | null;

  @ApiPropertyOptional({ example: 'Thành phố Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentProvince?: string | null;

  @ApiPropertyOptional({ description: 'Nơi thường trú: số nhà, đường, thôn' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  permanentAddress?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  permanentWard?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  permanentProvince?: string | null;

  @ApiPropertyOptional({ enum: PolicyGroup, isArray: true, description: 'Đối tượng chính sách' })
  @IsOptional()
  @IsArray()
  @IsEnum(PolicyGroup, { each: true })
  policyGroups?: PolicyGroup[];

  @ApiPropertyOptional({ description: 'Đội viên' })
  @IsOptional()
  @IsBoolean()
  youngPioneer?: boolean;

  @ApiPropertyOptional({ description: 'Đoàn viên' })
  @IsOptional()
  @IsBoolean()
  youthUnion?: boolean;

  @ApiPropertyOptional({ enum: ENTRY_KINDS, description: 'Tuyển mới or chuyển đến; recorded in the sổ đăng bộ' })
  @IsOptional()
  @IsIn(ENTRY_KINDS)
  entryKind?: (typeof ENTRY_KINDS)[number];

  @ApiPropertyOptional({ example: '2026-09-05', description: 'Ngày vào trường (today by default)' })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({ example: 'Trường THCS Nghĩa Tân', description: 'The school a transferred student comes from' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  previousSchool?: string;
}

export class UpdateStudentDto extends PartialType(OmitType(CreateStudentDto, ['entryKind', 'entryDate', 'previousSchool'] as const)) {}

export class StudentQuery extends PageQuery {
  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ enum: PolicyGroup, description: 'Students of one đối tượng chính sách' })
  @IsOptional()
  @IsEnum(PolicyGroup)
  policyGroup?: PolicyGroup;
}

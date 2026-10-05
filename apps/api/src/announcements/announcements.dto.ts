import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AnnouncementStatus, NotificationChannel, NotificationKind, Role, RsvpResponse } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

/** Only these two kinds are campaigns; the others are system alerts. */
export const ANNOUNCEMENT_KINDS = [NotificationKind.ANNOUNCEMENT, NotificationKind.EVENT] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export class AudienceDto {
  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'Mọi tài khoản đang hoạt động của các vai trò này' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ type: [String], description: 'Phụ huynh học sinh và GVCN của các lớp này' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ type: [Number], description: 'Phụ huynh học sinh và GVCN các lớp thuộc khối này (năm học hiện tại)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(12, { each: true })
  gradeLevels?: number[];
}

export class CreateAnnouncementDto {
  @ApiProperty({ enum: ANNOUNCEMENT_KINDS, default: NotificationKind.ANNOUNCEMENT })
  @IsIn(ANNOUNCEMENT_KINDS, { message: 'Loại phải là ANNOUNCEMENT hoặc EVENT' })
  kind: AnnouncementKind;

  @ApiProperty({ example: 'Họp phụ huynh đầu năm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ description: 'Thời gian diễn ra (sự kiện)' })
  @IsOptional()
  @IsDateString()
  eventAt?: string;

  @ApiPropertyOptional({ example: 'Phòng P.101' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ default: false, description: 'Người nhận xác nhận tham dự' })
  @IsOptional()
  @IsBoolean()
  rsvp?: boolean;

  @ApiProperty({ type: AudienceDto })
  @ValidateNested()
  @Type(() => AudienceDto)
  audience: AudienceDto;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true, default: [NotificationChannel.IN_APP] })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ description: 'Hẹn giờ gửi; có giá trị thì trạng thái là SCHEDULED' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateAnnouncementDto extends PartialType(OmitType(CreateAnnouncementDto, ['scheduledAt'] as const)) {
  @ApiPropertyOptional({ description: 'Hẹn giờ gửi; null để bỏ hẹn giờ (về nháp)', nullable: true })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}

export class AnnouncementQuery extends PageQuery {
  @ApiPropertyOptional({ enum: AnnouncementStatus })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_KINDS })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind;
}

export class RsvpDto {
  @ApiProperty({ enum: RsvpResponse })
  @IsEnum(RsvpResponse)
  response: RsvpResponse;
}

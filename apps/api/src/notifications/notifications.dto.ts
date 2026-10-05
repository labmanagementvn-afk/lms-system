import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationKind, SyncStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class NotificationQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Only unread' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ enum: NotificationKind })
  @IsOptional()
  @IsEnum(NotificationKind)
  kind?: NotificationKind;
}

export class NotificationSettingsDto {
  @ApiProperty({ enum: NotificationChannel, isArray: true })
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels: NotificationChannel[];
}

export class PushTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @ApiProperty({ example: 'android' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  platform: string;
}

export class DeliveryQuery extends PageQuery {
  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  status?: SyncStatus;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}

export class TestNotificationDto {
  @ApiProperty({ example: 'Thử thông báo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body: string;
}

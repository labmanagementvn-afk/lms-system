import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PageQuery } from '../common/pagination';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Only calls made by this user' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Module name, e.g. finance' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ enum: ['POST', 'PUT', 'PATCH', 'DELETE'] })
  @IsOptional()
  @IsIn(['POST', 'PUT', 'PATCH', 'DELETE'])
  method?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Only calls that returned 4xx/5xx' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  failed?: boolean;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Inclusive' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
}

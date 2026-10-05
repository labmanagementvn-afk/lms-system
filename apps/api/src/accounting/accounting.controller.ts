import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role, SyncKind, SyncStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { AccountingService } from './accounting.service';

export class SyncJobQueryDto extends PageQuery {
  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  status?: SyncStatus;

  @ApiPropertyOptional({ enum: SyncKind })
  @IsOptional()
  @IsEnum(SyncKind)
  kind?: SyncKind;
}

@ApiTags('accounting')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('accounting/sync')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: SyncJobQueryDto) {
    return this.service.list(user.schoolId, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.schoolId);
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Push this school’s pending documents to the accounting system now' })
  run(@CurrentUser() user: AuthUser) {
    return this.service.processDue(user.schoolId);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.retry(user.schoolId, id);
  }
}

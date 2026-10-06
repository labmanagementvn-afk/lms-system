import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AuditQuery } from './audit.dto';
import { AuditService } from './audit.service';

/** Nhật ký hệ thống: the school's own audit trail (district officers read theirs under /district/audit). */
@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'State-changing API calls made at this school, newest first' })
  list(@CurrentUser() user: AuthUser, @Query() query: AuditQuery) {
    return this.service.list({ schoolId: user.schoolId }, query);
  }

  @Get('areas')
  areas(@CurrentUser() user: AuthUser) {
    return this.service.areas({ schoolId: user.schoolId });
  }
}

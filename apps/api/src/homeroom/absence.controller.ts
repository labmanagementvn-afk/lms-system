import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { AbsenceQuery, AbsenceRequestDto, DecideAbsenceDto, RecordAbsenceDto } from './absence.dto';
import { AbsenceService } from './absence.service';

// Đơn xin nghỉ học at school: teachers see and decide those of their homeroom classes.
@ApiTags('homeroom')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('homeroom/absences')
export class AbsenceController {
  constructor(private readonly service: AbsenceService) {}

  @Get()
  @ApiOperation({ summary: 'Leave requests of my homeroom classes (every class for the office), waiting ones first' })
  list(@CurrentUser() user: AuthUser, @Query() query: AbsenceQuery) {
    return this.service.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Write down a request made by phone or on paper; it is approved at once' })
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordAbsenceDto) {
    return this.service.record(user, dto);
  }

  @Post(':id/decide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve or decline; approving turns the days already marked absent into "có phép"' })
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideAbsenceDto) {
    return this.service.decide(user, id, dto);
  }
}

/** Đơn xin nghỉ học from the parent app. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class ParentAbsenceController {
  constructor(private readonly service: AbsenceService) {}

  @Get('children/:id/absences')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.forChild(user, id);
  }

  @Post('children/:id/absences')
  @ApiOperation({ summary: "Ask for a child's days off; the homeroom teacher is told" })
  request(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AbsenceRequestDto) {
    return this.service.request(user, id, dto);
  }

  @Post('absences/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw a request the teacher has not decided yet' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}

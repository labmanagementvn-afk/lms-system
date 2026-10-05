import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { StudentAccessService } from './student-access.service';
import { BulkStudentAccountsDto, CreateStudentAccountDto, StudentAccountQuery, UpdateStudentAccountDto } from './student-accounts.dto';
import { StudentAccountsService } from './student-accounts.service';

/** Student login administration, for school staff. */
@ApiTags('students')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('students/accounts')
export class StudentAccountsController {
  constructor(private readonly service: StudentAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: StudentAccountQuery) {
    return this.service.list(user.schoolId, query);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Studying students without a login' })
  pending(@CurrentUser() user: AuthUser, @Query('classId') classId?: string) {
    return this.service.pending(user.schoolId, classId);
  }

  @Post()
  @ApiOperation({ summary: 'Create the login for one student; returns the first-time password once' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentAccountDto) {
    return this.service.create(user.schoolId, dto.studentId);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create logins for every student without one; returns the passwords to hand out' })
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkStudentAccountsDto) {
    return this.service.bulkCreate(user.schoolId, dto);
  }

  @Post(':userId/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.service.resetPassword(user.schoolId, userId);
  }

  @Patch(':userId')
  update(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() dto: UpdateStudentAccountDto) {
    return this.service.setActive(user.schoolId, userId, dto.isActive);
  }
}

/** What a signed-in student sees about themselves. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student')
export class StudentMeController {
  constructor(private readonly access: StudentAccessService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.access.current(user);
  }
}

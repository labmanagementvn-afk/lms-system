import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { BulkParentAccountsDto, CreateParentAccountDto, MonthQuery, ParentAccountQuery, ParentMealDto, UpdateParentAccountDto } from './parents.dto';
import { ParentsService } from './parents.service';

/** Parent account administration, for school staff. */
@ApiTags('parents')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('parents/accounts')
export class ParentAccountsController {
  constructor(private readonly service: ParentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ParentAccountQuery) {
    return this.service.listAccounts(user.schoolId, query);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Guardians who have no account yet, grouped by phone' })
  pending(@CurrentUser() user: AuthUser, @Query('classId') classId?: string) {
    return this.service.pending(user.schoolId, classId);
  }

  @Post()
  @ApiOperation({ summary: 'Create (or link) the account for one guardian; returns the first-time password once' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParentAccountDto) {
    return this.service.createAccount(user.schoolId, dto.guardianId);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create accounts for every guardian without one; returns the passwords to hand out' })
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkParentAccountsDto) {
    return this.service.bulkCreate(user.schoolId, dto);
  }

  @Post(':userId/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.service.resetPassword(user.schoolId, userId);
  }

  @Patch(':userId')
  update(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() dto: UpdateParentAccountDto) {
    return this.service.setActive(user.schoolId, userId, dto.isActive);
  }
}

/** What a parent sees about their own children. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class ParentController {
  constructor(private readonly service: ParentsService) {}

  @Get('children')
  @ApiOperation({ summary: "The parent's children with today's attendance" })
  children(@CurrentUser() user: AuthUser) {
    return this.service.children(user);
  }

  @Get('children/:id/attendance')
  attendance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: MonthQuery) {
    return this.service.attendance(user, id, query.month);
  }

  @Get('children/:id/invoices')
  invoices(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.invoices(user, id);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Invoice detail with the VietQR to pay it' })
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.invoice(user, id);
  }

  @Get('children/:id/health')
  health(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.healthRecord(user, id);
  }

  @Get('children/:id/meals')
  meals(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: MonthQuery) {
    return this.service.meals(user, id, query.month);
  }

  @Post('children/:id/meals')
  @HttpCode(200)
  registerMeals(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ParentMealDto) {
    return this.service.registerMeals(user, id, dto);
  }
}

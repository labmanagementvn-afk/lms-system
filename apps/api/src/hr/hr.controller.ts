import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import {
  ContractDto,
  CreateEmployeeDto,
  CreateLeaveDto,
  DecideLeaveDto,
  DocumentDto,
  EmployeeQuery,
  ExpiringQuery,
  LeaveQuery,
  LeaveRequestDto,
  UpdateContractDto,
  UpdateDocumentDto,
  UpdateEmployeeDto,
  WorkHistoryDto,
} from './hr.dto';
import { HrService } from './hr.service';

// Personnel files are office-only; teachers reach their own record through /hr/me.
@ApiTags('hr')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('hr')
export class HrController {
  constructor(private readonly service: HrService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.schoolId);
  }

  // ---- Employees ----

  @Get('employees')
  listEmployees(@CurrentUser() user: AuthUser, @Query() query: EmployeeQuery) {
    return this.service.listEmployees(user.schoolId, query);
  }

  @Post('employees')
  createEmployee(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.service.createEmployee(user.schoolId, dto);
  }

  @Post('employees/from-teachers')
  @ApiOperation({ summary: 'Tạo hồ sơ nhân sự cho mọi giáo viên chưa có' })
  fromTeachers(@CurrentUser() user: AuthUser) {
    return this.service.fromTeachers(user.schoolId);
  }

  @Get('employees/:id')
  getEmployee(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getEmployee(user.schoolId, id);
  }

  @Patch('employees/:id')
  updateEmployee(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.updateEmployee(user.schoolId, id, dto);
  }

  // ---- Documents ----

  @Post('employees/:id/documents')
  addDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DocumentDto) {
    return this.service.addDocument(user.schoolId, id, dto);
  }

  @Patch('documents/:docId')
  updateDocument(@CurrentUser() user: AuthUser, @Param('docId') docId: string, @Body() dto: UpdateDocumentDto) {
    return this.service.updateDocument(user.schoolId, docId, dto);
  }

  @Delete('documents/:docId')
  removeDocument(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    return this.service.removeDocument(user.schoolId, docId);
  }

  // ---- Contracts ----

  @Post('employees/:id/contracts')
  addContract(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ContractDto) {
    return this.service.addContract(user.schoolId, id, dto);
  }

  @Patch('contracts/:id')
  updateContract(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.service.updateContract(user.schoolId, id, dto);
  }

  @Delete('contracts/:id')
  removeContract(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeContract(user.schoolId, id);
  }

  // ---- Work history ----

  @Post('employees/:id/history')
  addHistory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WorkHistoryDto) {
    return this.service.addHistory(user.schoolId, id, dto);
  }

  @Delete('history/:id')
  removeHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeHistory(user.schoolId, id);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Giấy tờ và hợp đồng sắp hết hạn hoặc đã hết hạn' })
  expiring(@CurrentUser() user: AuthUser, @Query() query: ExpiringQuery) {
    return this.service.expiring(user.schoolId, query);
  }

  // ---- Leave ----

  @Get('leave')
  listLeave(@CurrentUser() user: AuthUser, @Query() query: LeaveQuery) {
    return this.service.listLeave(user.schoolId, query);
  }

  @Post('leave')
  createLeave(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveDto) {
    const { employeeId, ...rest } = dto;
    return this.service.createLeave(user.schoolId, employeeId, rest);
  }

  @Post('leave/:id/decide')
  @HttpCode(200)
  decideLeave(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.service.decideLeave(user.schoolId, id, user.userId, dto);
  }

  // ---- Self-service (every portal role) ----

  @Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ nhân sự của người đang đăng nhập' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.me(user.schoolId, user.userId);
  }

  @Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
  @Get('me/leave')
  myLeave(@CurrentUser() user: AuthUser, @Query() query: LeaveQuery) {
    return this.service.myLeave(user.schoolId, user.userId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
  @Post('me/leave')
  createMyLeave(@CurrentUser() user: AuthUser, @Body() dto: LeaveRequestDto) {
    return this.service.createMyLeave(user.schoolId, user.userId, dto);
  }
}

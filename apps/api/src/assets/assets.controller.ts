import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import {
  AssetQuery,
  AuditDto,
  AuditItemDto,
  CategoryDto,
  CreateAssetDto,
  DisposeDto,
  LoanDto,
  LoanQuery,
  MaintenanceDto,
  SupplierDto,
  UpdateAssetDto,
  UpdateCategoryDto,
  UpdateSupplierDto,
} from './assets.dto';
import { AssetsService } from './assets.service';

// Static paths are declared before ':id' so Express never treats them as an asset id.
@ApiTags('assets')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  // ---- Categories ----

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.service.listCategories(user.schoolId);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CategoryDto) {
    return this.service.createCategory(user.schoolId, dto);
  }

  @Patch('categories/:id')
  updateCategory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateCategory(user.schoolId, id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeCategory(user.schoolId, id);
  }

  // ---- Suppliers ----

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: AuthUser) {
    return this.service.listSuppliers(user.schoolId);
  }

  @Post('suppliers')
  createSupplier(@CurrentUser() user: AuthUser, @Body() dto: SupplierDto) {
    return this.service.createSupplier(user.schoolId, dto);
  }

  @Patch('suppliers/:id')
  updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.updateSupplier(user.schoolId, id, dto);
  }

  @Delete('suppliers/:id')
  removeSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeSupplier(user.schoolId, id);
  }

  // ---- Summary, loans, maintenance, audits ----

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.schoolId);
  }

  @Get('loans')
  listLoans(@CurrentUser() user: AuthUser, @Query() query: LoanQuery) {
    return this.service.listLoans(user.schoolId, query);
  }

  @Post('loans/:loanId/return')
  @HttpCode(200)
  returnLoan(@CurrentUser() user: AuthUser, @Param('loanId') loanId: string) {
    return this.service.returnLoan(user.schoolId, loanId);
  }

  @Post('maintenance/:id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sửa chữa xong: tài sản quay lại trạng thái đang sử dụng' })
  completeMaintenance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.completeMaintenance(user.schoolId, id);
  }

  @Get('audits')
  listAudits(@CurrentUser() user: AuthUser, @Query() query: PageQuery) {
    return this.service.listAudits(user.schoolId, query);
  }

  @Post('audits')
  @ApiOperation({ summary: 'Mở đợt kiểm kê cho mọi tài sản chưa thanh lý' })
  createAudit(@CurrentUser() user: AuthUser, @Body() dto: AuditDto) {
    return this.service.createAudit(user.schoolId, dto);
  }

  @Get('audits/:id')
  getAudit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getAudit(user.schoolId, id);
  }

  @Put('audits/:id/items/:assetId')
  setAuditItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('assetId') assetId: string, @Body() dto: AuditItemDto) {
    return this.service.setAuditItem(user.schoolId, id, assetId, dto);
  }

  @Post('audits/:id/close')
  @HttpCode(200)
  closeAudit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.closeAudit(user.schoolId, id);
  }

  // ---- Assets ----

  @Get()
  listAssets(@CurrentUser() user: AuthUser, @Query() query: AssetQuery) {
    return this.service.listAssets(user.schoolId, query);
  }

  @Post()
  createAsset(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.service.createAsset(user.schoolId, dto);
  }

  @Get(':id')
  getAsset(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getAsset(user.schoolId, id);
  }

  @Patch(':id')
  updateAsset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.updateAsset(user.schoolId, id, dto);
  }

  @Post(':id/dispose')
  @HttpCode(200)
  dispose(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DisposeDto) {
    return this.service.dispose(user.schoolId, id, dto);
  }

  @Post(':id/maintenance')
  addMaintenance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MaintenanceDto) {
    return this.service.addMaintenance(user.schoolId, id, dto);
  }

  @Post(':id/loans')
  lend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LoanDto) {
    return this.service.lend(user.schoolId, id, dto);
  }
}

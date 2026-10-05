import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { AllowQueryToken, CurrentUser, Roles } from '../common/decorators';
import { CreateExportDto, ExportQuery, ImportStudentsDto } from './moet.dto';
import { MoetService } from './moet.service';

/** Trao đổi dữ liệu CSDL ngành: exports in the MOET template and the student list import. */
@ApiTags('moet')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('moet')
export class MoetController {
  constructor(private readonly service: MoetService) {}

  @Get('exports')
  list(@CurrentUser() user: AuthUser, @Query() query: ExportQuery) {
    return this.service.list(user.schoolId, query);
  }

  @Post('exports')
  @ApiOperation({ summary: 'Build an exchange file (students, teachers, classes or term results) and keep it in the history' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExportDto) {
    return this.service.create(user.schoolId, user.userId, dto);
  }

  @AllowQueryToken()
  @Get('exports/:id/download')
  @ApiOperation({ summary: 'The CSV file of an export (accepts ?access_token= for browser downloads)' })
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { export: exp, file, stream } = await this.service.file(user.schoolId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exp.fileName}"`);
    res.setHeader('Content-Length', String(file.size));
    stream.pipe(res);
  }

  @AllowQueryToken()
  @Get('import/students/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="Mau_HocSinh_CSDL_nganh.csv"')
  template(@CurrentUser() user: AuthUser) {
    return this.service.template(user.schoolId);
  }

  @Post('import/students')
  @HttpCode(200)
  @ApiOperation({ summary: 'Upsert students by code from a MOET-format CSV; dryRun validates only. Returns counts and per-line errors.' })
  importStudents(@CurrentUser() user: AuthUser, @Body() dto: ImportStudentsDto) {
    return this.service.importStudents(user.schoolId, dto);
  }
}

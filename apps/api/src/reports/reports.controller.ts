import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators';
import { renderPdf } from './pdf';
import { ReportQuery } from './reports.dto';
import { ReportsService } from './reports.service';
import { renderXlsx } from './xlsx';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Báo cáo: official reports as PDF or Excel, or JSON for the on-screen preview. */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'The reports this user may run, with the parameters each takes' })
  catalogue(@CurrentUser() user: AuthUser) {
    return this.service.catalogue(user);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Build a report; format=pdf|xlsx downloads it, json (default) previews it' })
  async report(@CurrentUser() user: AuthUser, @Param('key') key: string, @Query() query: ReportQuery, @Res() res: Response) {
    const { document, letterhead } = await this.service.build(user, key, query);
    const format = query.format ?? 'json';
    if (format === 'json') {
      res.json({ document, letterhead });
      return;
    }
    const body = format === 'pdf' ? await renderPdf(document, letterhead) : await renderXlsx(document, letterhead);
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}.${format}"`);
    res.send(body);
  }
}

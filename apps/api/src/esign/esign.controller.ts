import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { AllowQueryToken, CurrentUser, Public, Roles } from '../common/decorators';
import { ERecordQuery, GenerateERecordsDto, RevokeERecordDto, SignatureProfileDto, SignERecordsDto, VerifyQuery } from './esign.dto';
import { ERecordsService } from './erecords.service';
import { SignaturesService } from './signatures.service';

/**
 * Where the portal is served, for the verification link printed on records: the configured
 * address, else the portal page that asked when it is on another origin than the API (the
 * browser sends Origin then), else the host the request came in on (through the portal's proxy).
 */
function webBase(req: Request) {
  if (process.env.PUBLIC_WEB_URL) return process.env.PUBLIC_WEB_URL;
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  return `${proto}://${host}`;
}

// Chữ ký số: each signer's remote signing account.
@ApiTags('esign')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('esign')
export class SignaturesController {
  constructor(private readonly service: SignaturesService) {}

  @Get('profile')
  @ApiOperation({ summary: "The caller's signing account and certificate, and the providers available" })
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Register the signing account; its certificate is looked up with the provider' })
  save(@CurrentUser() user: AuthUser, @Body() dto: SignatureProfileDto) {
    return this.service.save(user, dto);
  }

  @Delete('profile')
  remove(@CurrentUser() user: AuthUser) {
    return this.service.remove(user);
  }
}

// Học bạ số. The office and a class's homeroom teacher open and generate its records; the homeroom teacher signs, then the principal.
@ApiTags('erecords')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('erecords')
export class ERecordsController {
  constructor(private readonly service: ERecordsService) {}

  @Get()
  @ApiOperation({ summary: "A class's students, each with their latest record" })
  list(@CurrentUser() user: AuthUser, @Query() query: ERecordQuery) {
    return this.service.list(user, query);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Freeze the transcripts of a class (or some of its students) as unsigned records' })
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateERecordsDto) {
    return this.service.generate(user, dto);
  }

  @Post('sign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign records at their next step with the caller’s signing account' })
  sign(@CurrentUser() user: AuthUser, @Body() dto: SignERecordsDto) {
    return this.service.sign(user, dto.ids);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw a record; a new version can then be generated' })
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RevokeERecordDto) {
    return this.service.revoke(user, id, dto.reason);
  }

  @AllowQueryToken()
  @Get(':id/pdf')
  @ApiOperation({ summary: 'The record as PDF with its signature stamps (accepts ?access_token= for browser downloads)' })
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { fileName, buffer } = await this.service.pdf(user, id, webBase(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    res.send(buffer);
  }
}

// Tra cứu học bạ số: anyone holding the paper checks it with the code printed on it.
@ApiTags('public')
@Public()
@Controller('public/erecords')
export class PublicERecordsController {
  constructor(private readonly service: ERecordsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Check a record from the lookup code printed on it' })
  verify(@Param('id') id: string, @Query() query: VerifyQuery) {
    return this.service.publicVerify(id, query.code);
  }
}

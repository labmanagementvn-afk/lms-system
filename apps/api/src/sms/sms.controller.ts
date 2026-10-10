import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { CampaignQuery, ClassQuotaDto, MessageQuery, SmsCampaignDto, SmsPreviewDto, SmsSettingsDto, SmsTemplateDto, TemplateQuery, UpdateSmsTemplateDto, UsageQuery } from './sms.dto';
import { SmsService } from './sms.service';

// Tin nhắn SMS. The office texts parents and teachers and sets the quotas; a teacher texts the parents of their homeroom classes.
@ApiTags('sms')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('sms')
export class SmsController {
  constructor(private readonly service: SmsService) {}

  // ---- Settings and quotas ----

  @Get('settings')
  @ApiOperation({ summary: 'Brandname, default quotas, the SMS gateway in use and the placeholders' })
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: SmsSettingsDto) {
    return this.service.updateSettings(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Put('quotas/:classId')
  @ApiOperation({ summary: "A class's own monthly SMS limit; null returns it to the school's default" })
  setClassQuota(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Body() dto: ClassQuotaDto) {
    return this.service.setClassQuota(user.schoolId, classId, dto.monthlyLimit);
  }

  @Get('usage')
  @ApiOperation({ summary: 'SMS used and remaining per class (and for the school) in a month' })
  usage(@CurrentUser() user: AuthUser, @Query() query: UsageQuery) {
    return this.service.usage(user, query.month);
  }

  // ---- Templates ----

  @Get('templates')
  templates(@CurrentUser() user: AuthUser, @Query() query: TemplateQuery) {
    return this.service.templates(user.schoolId, query.audience);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('templates')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: SmsTemplateDto) {
    return this.service.createTemplate(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Patch('templates/:id')
  updateTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSmsTemplateDto) {
    return this.service.updateTemplate(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('templates/:id')
  removeTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeTemplate(user.schoolId, id);
  }

  // ---- Sending and history ----

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recipients, sample texts, SMS count and quota check, without sending' })
  preview(@CurrentUser() user: AuthUser, @Body() dto: SmsPreviewDto) {
    return this.service.preview(user, dto);
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Send now, or at scheduledAt; refused when a quota would be exceeded' })
  send(@CurrentUser() user: AuthUser, @Body() dto: SmsCampaignDto) {
    return this.service.send(user, dto);
  }

  @Get('campaigns')
  campaigns(@CurrentUser() user: AuthUser, @Query() query: CampaignQuery) {
    return this.service.campaigns(user, query);
  }

  @Get('campaigns/:id')
  campaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.campaign(user, id);
  }

  @Get('campaigns/:id/messages')
  @ApiOperation({ summary: 'Each text of a campaign with its delivery status' })
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: MessageQuery) {
    return this.service.messages(user, id, query);
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Call off a scheduled text before it is sent' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  @Post('campaigns/:id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send the failed texts of a campaign again' })
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.retry(user, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('dispatch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send every due text of the school now instead of waiting for the timer' })
  dispatch(@CurrentUser() user: AuthUser) {
    return this.service.dispatch(user.schoolId);
  }
}

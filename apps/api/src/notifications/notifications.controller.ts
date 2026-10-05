import { Body, Controller, Get, HttpCode, MessageEvent, Param, Post, Put, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Observable } from 'rxjs';
import { AuthUser } from '../common/auth-user';
import { AllowQueryToken, AnyRole, CurrentUser, Roles } from '../common/decorators';
import { DispatcherService } from './dispatcher.service';
import { DeliveryQuery, NotificationQuery, NotificationSettingsDto, PushTokenDto, TestNotificationDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly dispatcher: DispatcherService,
  ) {}

  // ---- Mine (every role) ----

  @AnyRole()
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQuery) {
    return this.service.list(user.userId, query);
  }

  @AnyRole()
  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.userId);
  }

  @AnyRole()
  @AllowQueryToken()
  @Sse('stream')
  @ApiOperation({ summary: 'Server-sent events: new notifications for the signed-in user (token may be passed as ?access_token=)' })
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.service.stream(user.userId);
  }

  @AnyRole()
  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.userId);
  }

  @AnyRole()
  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user.userId, id);
  }

  @AnyRole()
  @Post('push-tokens')
  registerToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.service.registerPushToken(user.userId, dto.token, dto.platform);
  }

  // ---- School settings and outbox (admin / staff) ----

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Put('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: NotificationSettingsDto) {
    return this.service.updateSettings(user.schoolId, dto.channels);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('deliveries')
  deliveries(@CurrentUser() user: AuthUser, @Query() query: DeliveryQuery) {
    return this.dispatcher.list(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('deliveries/summary')
  deliverySummary(@CurrentUser() user: AuthUser) {
    return this.dispatcher.summary(user.schoolId);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('deliveries/run')
  @HttpCode(200)
  run(@CurrentUser() user: AuthUser) {
    return this.dispatcher.processDue(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Post('test')
  @ApiOperation({ summary: 'Send a test notification to yourself on every enabled channel' })
  test(@CurrentUser() user: AuthUser, @Body() dto: TestNotificationDto) {
    return this.service.notifyUsers(user.schoolId, [user.userId], { kind: 'SYSTEM', title: dto.title, body: dto.body });
  }
}

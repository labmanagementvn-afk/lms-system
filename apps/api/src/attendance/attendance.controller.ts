import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, Roles } from '../common/decorators';
import {
  CreateDeviceDto,
  CreateIdentityDto,
  DailyQuery,
  EventsQuery,
  IdentityQuery,
  IngestDto,
  ManualEventDto,
  UpdateDeviceDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';
import { DevicesService } from './devices.service';
import { IdentitiesService } from './identities.service';
import { IngestService } from './ingest.service';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly devices: DevicesService,
    private readonly identities: IdentitiesService,
    private readonly ingestService: IngestService,
  ) {}

  // ---- Terminal ingestion ----

  @Public()
  @SkipThrottle()
  @Post('ingest')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Push check-in/out events from a gate terminal or vendor bridge',
    description: 'Authenticate with the device API key in the X-Device-Key header. Safe to retry: events are de-duplicated per device by eventId.',
  })
  @ApiHeader({ name: 'X-Device-Key', required: true })
  async ingest(@Headers('x-device-key') key: string | undefined, @Body() dto: IngestDto) {
    const device = await this.devices.authenticateKey(key);
    return this.ingestService.ingest(device, this.ingestService.fromGeneric(dto.events, device.school.timezone));
  }

  // ---- Manual entry and reports ----

  @Post('manual')
  @ApiOperation({ summary: 'Record a check-in/out by hand (guard, homeroom teacher)' })
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualEventDto) {
    return this.attendance.manual(user, dto);
  }

  @Get('events')
  events(@CurrentUser() user: AuthUser, @Query() query: EventsQuery) {
    return this.attendance.events(user.schoolId, query);
  }

  @Get('daily')
  daily(@CurrentUser() user: AuthUser, @Query() query: DailyQuery) {
    return this.attendance.daily(user.schoolId, query);
  }

  // ---- Devices ----

  @Roles(Role.ADMIN)
  @Get('devices')
  listDevices(@CurrentUser() user: AuthUser) {
    return this.devices.list(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Post('devices')
  createDevice(@CurrentUser() user: AuthUser, @Body() dto: CreateDeviceDto) {
    return this.devices.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('devices/:id')
  updateDevice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Post('devices/:id/rotate-key')
  rotateKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.devices.rotateKey(user.schoolId, id);
  }

  @Roles(Role.ADMIN)
  @Delete('devices/:id')
  removeDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.devices.remove(user.schoolId, id);
  }

  // ---- Identities (terminal person ID / card -> student or teacher) ----

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('identities')
  listIdentities(@CurrentUser() user: AuthUser, @Query() query: IdentityQuery) {
    return this.identities.list(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('identities')
  createIdentity(@CurrentUser() user: AuthUser, @Body() dto: CreateIdentityDto) {
    return this.identities.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('identities/:id/revoke')
  revokeIdentity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.identities.revoke(user.schoolId, id);
  }

  @Roles(Role.ADMIN)
  @Delete('identities/:id')
  removeIdentity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.identities.remove(user.schoolId, id);
  }
}

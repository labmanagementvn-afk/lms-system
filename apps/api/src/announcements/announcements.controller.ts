import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { AnyRole, CurrentUser, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { AnnouncementQuery, CreateAnnouncementDto, RsvpDto, UpdateAnnouncementDto } from './announcements.dto';
import { AnnouncementsService } from './announcements.service';

// Thông báo & sự kiện. The office manages every announcement; a teacher may write to their own homeroom classes.
@ApiTags('announcements')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // ---- Mine (every role, incl. parents and drivers) ----

  @AnyRole()
  @Get('mine')
  @ApiOperation({ summary: 'Sent announcements the signed-in user received, newest first, with their own RSVP' })
  mine(@CurrentUser() user: AuthUser, @Query() query: PageQuery) {
    return this.service.mine(user, query);
  }

  @AnyRole()
  @Get(':id/rsvp')
  myRsvp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.myRsvp(user, id);
  }

  @AnyRole()
  @Post(':id/rsvp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Answer an event invitation (only recipients of a sent announcement that asks for RSVP)' })
  rsvp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RsvpDto) {
    return this.service.rsvp(user, id, dto.response);
  }

  // ---- Management ----

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AnnouncementQuery) {
    return this.service.list(user, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('run-scheduled')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send every scheduled announcement of the school whose time has come' })
  runScheduled(@CurrentUser() user: AuthUser) {
    return this.service.runScheduled(user.schoolId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One announcement with delivery, read and RSVP statistics' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create as a draft, or scheduled when scheduledAt is given' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Post(':id/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'How many people would receive it now, per role' })
  preview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.preview(user, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve the audience and send now' })
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.send(user, id);
  }
}

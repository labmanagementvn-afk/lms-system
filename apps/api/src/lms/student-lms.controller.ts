import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { CreatePostDto, CreateThreadDto, ProgressDto } from './lms.dto';
import { StudentLmsService } from './student-lms.service';

/** The student app: my courses, the lesson player, boards and live rooms. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student')
export class StudentLmsController {
  constructor(private readonly service: StudentLmsService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Enrolled courses with progress and next lesson, plus open courses to join' })
  courses(@CurrentUser() user: AuthUser) {
    return this.service.courses(user);
  }

  @Post('courses/:id/enrol')
  @HttpCode(200)
  enrol(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.enrol(user, id);
  }

  @Get('courses/:id')
  course(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.course(user, id);
  }

  @Get('courses/:id/threads')
  threads(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.threads(user, id);
  }

  @Post('courses/:id/threads')
  createThread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateThreadDto) {
    return this.service.createThread(user, id, dto);
  }

  @Get('lessons/:id')
  @ApiOperation({ summary: 'One lesson with my progress and the previous / next lesson' })
  lesson(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.lesson(user, id);
  }

  @Post('lessons/:id/progress')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add time spent, mark started / completed, store SCORM data; recomputes course progress' })
  progress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProgressDto) {
    return this.service.progress(user, id, dto);
  }

  @Get('threads/:id')
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.thread(user, id);
  }

  @Post('threads/:id/posts')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePostDto) {
    return this.service.reply(user, id, dto);
  }

  @Get('live')
  @ApiOperation({ summary: 'Live rooms of my courses from yesterday on' })
  live(@CurrentUser() user: AuthUser, @Query('courseId') courseId?: string) {
    return this.service.liveSessions(user, courseId || undefined);
  }

  @Post('live/:id/join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record attendance and get the room link (LIVE, or SCHEDULED within 15 minutes)' })
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.joinLive(user, id);
  }
}

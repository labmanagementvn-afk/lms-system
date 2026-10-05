import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators';
import { CoursesService } from './courses.service';
import { DiscussionsService } from './discussions.service';
import { LiveService } from './live.service';
import {
  CourseQuery,
  CreateCourseDto,
  CreateLessonDto,
  CreateLiveDto,
  CreatePostDto,
  CreateThreadDto,
  EnrolStudentsDto,
  LiveQuery,
  ReorderDto,
  SectionDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdateThreadDto,
} from './lms.dto';
import { ReportsService } from './reports.service';

// Portal routes (ADMIN, STAFF, TEACHER): the course builder, enrolment, boards, live rooms and reports.

@ApiTags('lms')
@ApiBearerAuth()
@Controller('lms/courses')
export class LmsCoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly discussions: DiscussionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Courses of the school (mine=true: the signed-in teacher only)' })
  list(@CurrentUser() user: AuthUser, @Query() query: CourseQuery) {
    return this.courses.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.courses.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Course with its sections and lessons in order' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.get(user.schoolId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft course' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.remove(user.schoolId, id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Open the course: enrols the audience classes and notifies the students' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.publish(user.schoolId, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.archive(user.schoolId, id);
  }

  @Post(':id/sections')
  addSection(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SectionDto) {
    return this.courses.addSection(user.schoolId, id, dto);
  }

  @Post(':id/lessons')
  addLesson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateLessonDto) {
    return this.courses.addLesson(user.schoolId, id, dto);
  }

  @Post(':id/reorder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rewrite section order and lesson placement from the builder layout (id null = unsectioned)' })
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderDto) {
    return this.courses.reorder(user.schoolId, id, dto);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'Enrolled students with progress and per-lesson status' })
  students(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.students(user.schoolId, id);
  }

  @Post(':id/students')
  enrol(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EnrolStudentsDto) {
    return this.courses.enrol(user.schoolId, id, dto);
  }

  @Delete(':id/students/:studentId')
  unenrol(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.courses.unenrol(user.schoolId, id, studentId);
  }

  @Get(':id/threads')
  async threads(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.courses.get(user.schoolId, id);
    return this.discussions.listThreads(id);
  }

  @Post(':id/threads')
  async createThread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateThreadDto) {
    await this.courses.get(user.schoolId, id);
    return this.discussions.createThread(user.schoolId, id, user.userId, dto);
  }
}

@ApiTags('lms')
@ApiBearerAuth()
@Controller('lms')
export class LmsContentController {
  constructor(
    private readonly courses: CoursesService,
    private readonly discussions: DiscussionsService,
  ) {}

  @Patch('sections/:id')
  updateSection(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SectionDto) {
    return this.courses.updateSection(user.schoolId, id, dto);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete a section; its lessons stay in the course unsectioned' })
  removeSection(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.removeSection(user.schoolId, id);
  }

  @Patch('lessons/:id')
  updateLesson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.courses.updateLesson(user.schoolId, id, dto);
  }

  @Delete('lessons/:id')
  removeLesson(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courses.removeLesson(user.schoolId, id);
  }

  @Get('threads/:id')
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discussions.getThread(user.schoolId, id);
  }

  @Post('threads/:id/posts')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePostDto) {
    return this.discussions.addPost(user.schoolId, id, user.userId, dto);
  }

  @Patch('threads/:id')
  @ApiOperation({ summary: 'Pin or lock a thread' })
  updateThread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateThreadDto) {
    return this.discussions.updateThread(user.schoolId, id, dto);
  }

  @Delete('threads/:id')
  removeThread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discussions.removeThread(user.schoolId, id);
  }

  @Delete('posts/:id')
  removePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discussions.removePost(user.schoolId, id);
  }
}

@ApiTags('lms')
@ApiBearerAuth()
@Controller('lms/live')
export class LmsLiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  @ApiOperation({ summary: 'Live rooms: running first, then upcoming, then past; each with its Jitsi joinUrl' })
  list(@CurrentUser() user: AuthUser, @Query() query: LiveQuery) {
    return this.live.list(user.schoolId, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLiveDto) {
    return this.live.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One room with who joined and when' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.get(user.schoolId, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Open the room and notify enrolled students' })
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.start(user.schoolId, id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.end(user.schoolId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.cancel(user.schoolId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scheduled or cancelled room' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.live.remove(user.schoolId, id);
  }
}

@ApiTags('lms')
@ApiBearerAuth()
@Controller('lms/reports')
export class LmsReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.reports.overview(user.schoolId);
  }

  @Get('courses/:id')
  course(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.course(user.schoolId, id);
  }

  @Get('students/:studentId')
  student(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.reports.student(user.schoolId, studentId);
  }
}

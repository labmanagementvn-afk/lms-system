import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import {
  CreateQuestionDto,
  CreateTestDto,
  GradeAttemptDto,
  ImportQuestionsDto,
  LeaderboardQuery,
  QuestionQuery,
  RandomQuestionsDto,
  SaveAnswersDto,
  SetTestQuestionsDto,
  SubmitAttemptDto,
  TestQuery,
  UpdateQuestionDto,
  UpdateTestDto,
} from './assessments.dto';
import { AttemptsService } from './attempts.service';
import { QuestionsService } from './questions.service';
import { TestsService } from './tests.service';

const CSV = 'text/csv; charset=utf-8';

/** Ngân hàng câu hỏi, for teachers and the office. */
@ApiTags('assessments')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('lms/questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: 'Question bank, paged, with how many tests use each question' })
  list(@CurrentUser() user: AuthUser, @Query() query: QuestionQuery) {
    return this.service.list(user.schoolId, query);
  }

  // Static paths come before ':id' so Express does not read them as ids.
  @Get('tags')
  @ApiOperation({ summary: 'Distinct tags used in the bank' })
  tags(@CurrentUser() user: AuthUser) {
    return this.service.tags(user.schoolId);
  }

  @Get('export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="ngan-hang-cau-hoi.csv"')
  @ApiOperation({ summary: 'CSV of the bank with the same filters as the list' })
  exportCsv(@CurrentUser() user: AuthUser, @Query() query: QuestionQuery) {
    return this.service.exportCsv(user.schoolId, query);
  }

  @Post('import')
  @HttpCode(200)
  @ApiOperation({ summary: 'Import questions from CSV text; returns { created, errors: [{ line, message }] }' })
  importCsv(@CurrentUser() user: AuthUser, @Body() dto: ImportQuestionsDto) {
    return this.service.importCsv(user.schoolId, user.userId, dto.csv);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuestionDto) {
    return this.service.create(user.schoolId, user.userId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.schoolId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.service.update(user.schoolId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletes an unused question; a question placed in a test is hidden instead' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }
}

/** Bài kiểm tra, bài thi, cuộc thi: lifecycle, questions, attempts, grading and reports. */
@ApiTags('assessments')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('lms/tests')
export class TestsController {
  constructor(private readonly service: TestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: TestQuery) {
    return this.service.list(user.schoolId, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTestDto) {
    return this.service.create(user.schoolId, user.userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'The test with its questions and answer keys' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.schoolId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTestDto) {
    return this.service.update(user.schoolId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }

  @Put(':id/questions')
  @ApiOperation({ summary: 'Replace the question list (draft, or published without attempts)' })
  setQuestions(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetTestQuestionsDto) {
    return this.service.setQuestions(user.schoolId, id, dto);
  }

  @Post(':id/questions/random')
  @HttpCode(200)
  @ApiOperation({ summary: 'Append random bank questions per difficulty' })
  addRandom(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RandomQuestionsDto) {
    return this.service.addRandom(user.schoolId, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish and notify the students concerned (TEST_ASSIGNED)' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.publish(user.schoolId, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.close(user.schoolId, id);
  }

  @Get(':id/attempts')
  @ApiOperation({ summary: 'One row per student with their best and latest attempt' })
  attempts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.attempts(user.schoolId, id);
  }

  @Get(':id/leaderboard')
  leaderboard(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: LeaderboardQuery) {
    return this.service.leaderboard(user.schoolId, id, query.limit);
  }

  @Get(':id/stats')
  stats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.stats(user.schoolId, id);
  }

  @Get(':id/export')
  @Header('Content-Type', CSV)
  @Header('Content-Disposition', 'attachment; filename="ket-qua-kiem-tra.csv"')
  exportCsv(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.exportCsv(user.schoolId, id);
  }
}

/** A student's attempt as the teacher sees it, and manual grading. */
@ApiTags('assessments')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('lms/attempts')
export class AttemptsController {
  constructor(private readonly service: TestsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Questions in order with the answer, the key and the grading' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.attemptDetail(user.schoolId, id);
  }

  @Put(':id/grade')
  @ApiOperation({ summary: 'Fill manual points per question; the attempt becomes GRADED once nothing is pending' })
  grade(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GradeAttemptDto) {
    return this.service.grade(user.schoolId, user.userId, id, dto);
  }
}

/** The student app: tests assigned to the signed-in student. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student/tests')
export class StudentTestsController {
  constructor(private readonly service: AttemptsService) {}

  @Get()
  @ApiOperation({ summary: 'Visible tests (contests excluded) with my attempts and whether I may start' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Top 50 and my rank' })
  leaderboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.leaderboard(user, id);
  }

  @Post(':id/attempts')
  @ApiOperation({ summary: 'Start an attempt (or resume the one in progress); questions come without answer keys' })
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(user, id);
  }
}

/** The student app: taking a test. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student/attempts')
export class StudentAttemptsController {
  constructor(private readonly service: AttemptsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Questions, saved answers and remaining seconds (for resuming)' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Put(':id/answers')
  @ApiOperation({ summary: 'Autosave answers while in progress' })
  save(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SaveAnswersDto) {
    return this.service.save(user, id, dto.answers);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Grade and hand in; returns the result' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitAttemptDto) {
    return this.service.submit(user, id, dto.answers);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Score and pass/fail; per-question feedback when the test shows results' })
  result(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.result(user, id);
  }
}

/** The student app: school-wide and class contests with leaderboards. */
@ApiTags('student app')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student/contests')
export class StudentContestsController {
  constructor(private readonly service: AttemptsService) {}

  @Get()
  @ApiOperation({ summary: 'Contests I can see with my best attempt, my rank and the top 10' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.contests(user);
  }
}

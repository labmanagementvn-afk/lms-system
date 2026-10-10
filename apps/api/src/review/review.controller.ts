import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { CompletionService } from './completion.service';
import { CompletionQuery, CompletionStudentDto, CouncilDto, RecognizeDto, RegisterAllDto, RetakeResultsDto, RetakeSubjectsDto, ReviewScopeQuery, TrainingDto } from './review.dto';
import { ReviewService } from './review.service';

const roundOf = (round: number) => {
  if (round !== 1 && round !== 2) throw new BadRequestException('Đợt xét phải là 1 hoặc 2');
  return round;
};

/** Xét lên lớp after the year: retakes, summer training and the promotion that follows. */
@ApiTags('grades')
@ApiBearerAuth()
@Controller('grades/review')
export class ReviewController {
  constructor(private readonly service: ReviewService) {}

  @Get('retakes')
  @ApiOperation({ summary: 'Students who retake subjects (kiểm tra lại) or may, with registered subjects and results' })
  retakes(@CurrentUser() user: AuthUser, @Query() query: ReviewScopeQuery) {
    return this.service.retakes(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('retakes/register')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register every eligible subject for the students on the list who have none yet' })
  registerAll(@CurrentUser() user: AuthUser, @Body() dto: RegisterAllDto) {
    return this.service.registerAll(user, dto);
  }

  @Put('retakes/results')
  @ApiOperation({ summary: 'Enter retake results (office, or teachers for the subjects they teach); promotion is recomputed' })
  saveResults(@CurrentUser() user: AuthUser, @Body() dto: RetakeResultsDto) {
    return this.service.saveResults(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put('retakes/:studentId')
  @ApiOperation({ summary: 'Set the subjects a student retakes' })
  setRetakes(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: RetakeSubjectsDto) {
    return this.service.setRetakes(user, studentId, dto);
  }

  @Get('training')
  @ApiOperation({ summary: 'Students whose year conduct is Chưa đạt, with summer training tasks and re-evaluation' })
  trainings(@CurrentUser() user: AuthUser, @Query() query: ReviewScopeQuery) {
    return this.service.trainings(user.schoolId, query);
  }

  @Put('training/:studentId')
  @ApiOperation({ summary: 'Set summer training tasks and the re-evaluated conduct (homeroom teacher or office)' })
  saveTraining(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: TrainingDto) {
    return this.service.saveTraining(user, studentId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('training/:studentId')
  @ApiOperation({ summary: 'Remove the summer training of a student' })
  removeTraining(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.removeTraining(user, studentId);
  }

  @Get('promotion')
  @ApiOperation({ summary: 'Promotion per class after the summer review, and every student not promoted outright' })
  promotion(@CurrentUser() user: AuthUser, @Query() query: ReviewScopeQuery) {
    return this.service.promotion(user.schoolId, query);
  }
}

/** Xét công nhận hoàn thành chương trình giáo dục THCS (grade 9), confirmed in the học bạ. */
@ApiTags('grades')
@ApiBearerAuth()
@Controller('grades/completion')
export class CompletionController {
  constructor(private readonly service: CompletionService) {}

  @Get()
  @ApiOperation({ summary: 'Grade 9 students with the completion conditions, and the council and decision of a round' })
  overview(@CurrentUser() user: AuthUser, @Query() query: CompletionQuery) {
    return this.service.overview(user.schoolId, query.round ?? 1, query.classId);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put('rounds/:round')
  @ApiOperation({ summary: 'Council decision, meeting and members of a round' })
  saveCouncil(@CurrentUser() user: AuthUser, @Param('round', ParseIntPipe) round: number, @Body() dto: CouncilDto) {
    return this.service.saveCouncil(user, roundOf(round), dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put('students/:studentId')
  @ApiOperation({ summary: 'Dossier, priority group and note of a grade 9 student' })
  saveStudent(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() dto: CompletionStudentDto) {
    return this.service.saveStudent(user, studentId, dto);
  }

  @Roles(Role.ADMIN)
  @Post('rounds/:round/recognize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record the recognition decision: every eligible student is recognised and numbered' })
  recognize(@CurrentUser() user: AuthUser, @Param('round', ParseIntPipe) round: number, @Body() dto: RecognizeDto) {
    return this.service.recognize(user, roundOf(round), dto);
  }

  @Roles(Role.ADMIN)
  @Delete('rounds/:round/recognize')
  @ApiOperation({ summary: 'Withdraw the latest round decision' })
  cancel(@CurrentUser() user: AuthUser, @Param('round', ParseIntPipe) round: number) {
    return this.service.cancel(user, roundOf(round));
  }
}

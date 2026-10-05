import { Module } from '@nestjs/common';
import { AttemptsController, QuestionsController, StudentAttemptsController, StudentContestsController, StudentTestsController, TestsController } from './assessments.controller';
import { AttemptsService } from './attempts.service';
import { QuestionsService } from './questions.service';
import { TestsService } from './tests.service';

/** Ngân hàng câu hỏi, bài kiểm tra / bài thi / cuộc thi and the student's test-taking endpoints. */
@Module({
  controllers: [QuestionsController, TestsController, AttemptsController, StudentTestsController, StudentAttemptsController, StudentContestsController],
  providers: [QuestionsService, TestsService, AttemptsService],
  exports: [QuestionsService, TestsService, AttemptsService],
})
export class AssessmentsModule {}

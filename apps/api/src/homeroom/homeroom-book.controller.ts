import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { BookQuery, BookReviewDto, MeetingDto, MonthPlanDto, SaveBookDto, StudentNoteDto, UpdateMeetingDto, UpdateStudentNoteDto } from './homeroom-book.dto';
import { HomeroomBookService } from './homeroom-book.service';

// Sổ chủ nhiệm: the homeroom teacher's book of the class. Teachers reach only the classes they are homeroom teacher of.
@ApiTags('homeroom')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('homeroom/book')
export class HomeroomBookController {
  constructor(private readonly service: HomeroomBookService) {}

  @Get()
  @ApiOperation({ summary: "The class's book: subject teachers, students and families, the class's situation, results, and everything the teacher wrote" })
  book(@CurrentUser() user: AuthUser, @Query() query: BookQuery) {
    return this.service.book(user, query);
  }

  @Put()
  @ApiOperation({ summary: 'Save class officers, the parents committee, the tổ, the seating chart or the year plan (parts left out stay)' })
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveBookDto) {
    return this.service.save(user, dto);
  }

  @Put('month-plans')
  @ApiOperation({ summary: "Write a month's plan and its review" })
  saveMonth(@CurrentUser() user: AuthUser, @Body() dto: MonthPlanDto) {
    return this.service.saveMonth(user, dto);
  }

  @Delete('month-plans/:id')
  @HttpCode(204)
  removeMonth(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMonth(user, id);
  }

  @Post('meetings')
  @ApiOperation({ summary: 'Record a parent meeting (biên bản họp cha mẹ học sinh)' })
  addMeeting(@CurrentUser() user: AuthUser, @Body() dto: MeetingDto) {
    return this.service.addMeeting(user, dto);
  }

  @Patch('meetings/:id')
  updateMeeting(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.service.updateMeeting(user, id, dto);
  }

  @Delete('meetings/:id')
  @HttpCode(204)
  removeMeeting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMeeting(user, id);
  }

  @Post('notes')
  @ApiOperation({ summary: 'Note a student the teacher follows: one needing attention, an outstanding one, their progress' })
  addNote(@CurrentUser() user: AuthUser, @Body() dto: StudentNoteDto) {
    return this.service.addNote(user, dto);
  }

  @Patch('notes/:id')
  updateNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentNoteDto) {
    return this.service.updateNote(user, id, dto);
  }

  @Delete('notes/:id')
  @HttpCode(204)
  removeNote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeNote(user, id);
  }

  @Roles(Role.ADMIN)
  @Post('reviews')
  @ApiOperation({ summary: "The principal's or a vice principal's review of the book (ý kiến kiểm tra)" })
  addReview(@CurrentUser() user: AuthUser, @Body() dto: BookReviewDto) {
    return this.service.addReview(user, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('reviews/:id')
  @HttpCode(204)
  removeReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeReview(user, id);
  }
}

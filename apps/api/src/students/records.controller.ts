import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ParentAccessService } from '../parents/parent-access.service';
import { MeritsService } from './merits.service';
import { MovementsService } from './movements.service';
import { StudentProfileService } from './profile.service';
import { AwardDto, DisciplineDto, DropOutDto, MeritQuery, MoveClassDto, MovementQuery, ReadmitDto, TransferOutDto, UpdateDisciplineDto } from './records.dto';

/**
 * Hồ sơ học sinh: the profile, movements (chuyển lớp, chuyển trường, thôi học, trở lại học)
 * and commendation and discipline. Registered before StudentsController so
 * "students/awards" is not taken for a student id.
 */
@ApiTags('students')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.TEACHER)
@Controller('students')
export class StudentRecordsController {
  constructor(
    private readonly movements: MovementsService,
    private readonly merits: MeritsService,
    private readonly profiles: StudentProfileService,
  ) {}

  @Get('movements')
  @ApiOperation({ summary: 'Biến động học sinh: class changes, transfers, dropping out, coming back' })
  listMovements(@CurrentUser() user: AuthUser, @Query() query: MovementQuery) {
    return this.movements.list(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('move-class')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chuyển lớp: moves the students and their marks of the year to a class of the same grade' })
  moveClass(@CurrentUser() user: AuthUser, @Body() dto: MoveClassDto) {
    return this.movements.moveClass(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('transfer-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chuyển trường: the students leave for another school' })
  transferOut(@CurrentUser() user: AuthUser, @Body() dto: TransferOutDto) {
    return this.movements.transferOut(user, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('drop-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Thôi học' })
  dropOut(@CurrentUser() user: AuthUser, @Body() dto: DropOutDto) {
    return this.movements.dropOut(user, dto);
  }

  @Get('awards')
  @ApiOperation({ summary: 'Khen thưởng in a period, a class or of a student' })
  listAwards(@CurrentUser() user: AuthUser, @Query() query: MeritQuery) {
    return this.merits.listAwards(user.schoolId, query);
  }

  @Post('awards')
  @ApiOperation({ summary: 'Records a commendation for the students (Thông tư 19/2025, Điều 5 to 10); parents are told' })
  award(@CurrentUser() user: AuthUser, @Body() dto: AwardDto) {
    return this.merits.award(user, dto);
  }

  @Delete('awards/:id')
  removeAward(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merits.removeAward(user, id);
  }

  @Get('discipline')
  @ApiOperation({ summary: 'Kỷ luật in a period, a class or of a student' })
  listDiscipline(@CurrentUser() user: AuthUser, @Query() query: MeritQuery) {
    return this.merits.listDiscipline(user.schoolId, query);
  }

  @Post('discipline')
  @ApiOperation({ summary: 'Records a violation and its measure, checked against Điều 13 to 17 of Thông tư 19/2025' })
  discipline(@CurrentUser() user: AuthUser, @Body() dto: DisciplineDto) {
    return this.merits.discipline(user, dto);
  }

  @Patch('discipline/:id')
  @ApiOperation({ summary: 'Support activities, and the family confirming a self-review' })
  updateDiscipline(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDisciplineDto) {
    return this.merits.updateDiscipline(user, id, dto);
  }

  @Delete('discipline/:id')
  removeDiscipline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merits.removeDiscipline(user, id);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'The whole record: family, school years and results, movements, commendation and discipline, attendance' })
  profile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.profiles.profile(user.schoolId, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post(':id/readmit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trở lại học: a student who left comes back to a class' })
  readmit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReadmitDto) {
    return this.movements.readmit(user, id, dto);
  }
}

/** A child's commendation and discipline in the parent app, and the family's confirmation of a self-review. */
@ApiTags('parent app')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class ParentMeritsController {
  constructor(
    private readonly merits: MeritsService,
    private readonly access: ParentAccessService,
  ) {}

  @Get('children/:id/merits')
  async childMerits(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const student = await this.access.assertChild(user, id);
    return { student, ...(await this.merits.ofStudent(user.schoolId, id)) };
  }

  @Post('discipline/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'The family confirms the self-review and its commitment (Điều 15)' })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merits.confirmByFamily(user, id);
  }
}

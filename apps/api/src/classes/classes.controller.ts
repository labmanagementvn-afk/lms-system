import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ClassQuery, CreateClassDto, EnrollDto, UpdateClassDto } from './classes.dto';
import { ClassesService } from './classes.service';

@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ClassQuery) {
    return this.service.list(user.schoolId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.schoolId, id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.service.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }

  @Get(':id/students')
  students(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.students(user.schoolId, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post(':id/students')
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EnrollDto) {
    return this.service.enroll(user.schoolId, id, dto.studentIds);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete(':id/students/:studentId')
  unenroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.service.unenroll(user.schoolId, id, studentId);
  }
}

import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

export class SubjectDto {
  @ApiProperty({ example: 'TOAN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateSubjectDto extends PartialType(SubjectDto) {}

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(schoolId: string) {
    return this.prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
  }

  async create(schoolId: string, dto: SubjectDto) {
    try {
      return await this.prisma.subject.create({ data: { ...dto, schoolId } });
    } catch (e) {
      rethrowPrismaError(e, 'Mã môn học đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateSubjectDto) {
    await this.prisma.subject.findFirstOrThrow({ where: { id, schoolId } });
    try {
      return await this.prisma.subject.update({ where: { id }, data: dto });
    } catch (e) {
      rethrowPrismaError(e, 'Mã môn học đã tồn tại');
    }
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.subject.findFirstOrThrow({ where: { id, schoolId } });
    try {
      await this.prisma.subject.delete({ where: { id } });
    } catch (e) {
      rethrowPrismaError(e, 'Môn học đang được dùng trong thời khóa biểu');
    }
  }
}

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SubjectDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.service.update(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }
}

@Module({ controllers: [SubjectsController], providers: [SubjectsService] })
export class SubjectsModule {}

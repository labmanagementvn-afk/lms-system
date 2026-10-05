import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

export class AcademicYearDto {
  @ApiProperty({ example: '2026-2027' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2026-09-05' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2027-05-31' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateAcademicYearDto extends PartialType(AcademicYearDto) {}

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  list(schoolId: string) {
    return this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } });
  }

  /** The year marked current, or the most recent one. */
  async current(schoolId: string) {
    const year =
      (await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } })) ??
      (await this.prisma.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: 'desc' } }));
    if (!year) throw new BadRequestException('Chưa khai báo năm học');
    return year;
  }

  async create(schoolId: string, dto: AcademicYearDto) {
    if (dto.startDate >= dto.endDate) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isCurrent) await tx.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
        return tx.academicYear.create({
          data: { schoolId, name: dto.name, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), isCurrent: !!dto.isCurrent },
        });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Năm học đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateAcademicYearDto) {
    await this.prisma.academicYear.findFirstOrThrow({ where: { id, schoolId } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isCurrent) await tx.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
        return tx.academicYear.update({
          where: { id },
          data: {
            name: dto.name,
            isCurrent: dto.isCurrent,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          },
        });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Năm học đã tồn tại');
    }
  }
}

@ApiTags('academic-years')
@ApiBearerAuth()
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly service: AcademicYearsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.schoolId);
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.service.current(user.schoolId);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AcademicYearDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAcademicYearDto) {
    return this.service.update(user.schoolId, id, dto);
  }
}

@Module({ controllers: [AcademicYearsController], providers: [AcademicYearsService], exports: [AcademicYearsService] })
export class AcademicYearsModule {}

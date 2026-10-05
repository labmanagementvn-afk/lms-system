import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './auth.dto';

const userInclude = { school: true, district: true, teacher: { select: { id: true } }, student: { select: { id: true } } } satisfies Prisma.UserInclude;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    let where: Prisma.UserWhereUniqueInput;
    if (dto.email) where = { email: dto.email.toLowerCase() };
    else if (dto.phone) {
      const phone = normalizePhone(dto.phone);
      if (!phone) throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
      where = { phone };
    } else if (dto.username) where = { username: dto.username.trim().toLowerCase() };
    else throw new BadRequestException('Nhập email, số điện thoại hoặc mã học sinh');

    const user = await this.prisma.user.findUnique({ where, include: userInclude });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(
        dto.email ? 'Email hoặc mật khẩu không đúng' : dto.phone ? 'Số điện thoại hoặc mật khẩu không đúng' : 'Mã học sinh hoặc mật khẩu không đúng',
      );
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      schoolId: user.schoolId,
      districtId: user.districtId,
      role: user.role,
      email: user.email,
    });
    return { accessToken, user: this.present(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
    return this.present(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false } });
    return { ok: true };
  }

  private present(user: Prisma.UserGetPayload<{ include: typeof userInclude }>) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      teacherId: user.teacher?.id ?? null,
      studentId: user.student?.id ?? null,
      school: user.school ? { id: user.school.id, name: user.school.name, code: user.school.code, timezone: user.school.timezone, lateAfter: user.school.lateAfter } : null,
      district: user.district ? { id: user.district.id, code: user.district.code, name: user.district.name, level: user.district.level, province: user.district.province } : null,
    };
  }
}

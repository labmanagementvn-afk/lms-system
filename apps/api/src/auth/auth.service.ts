import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './auth.dto';

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
    } else throw new BadRequestException('Nhập email hoặc số điện thoại');

    const user = await this.prisma.user.findUnique({ where, include: { school: true, teacher: { select: { id: true } } } });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(dto.email ? 'Email hoặc mật khẩu không đúng' : 'Số điện thoại hoặc mật khẩu không đúng');
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      schoolId: user.schoolId,
      role: user.role,
      email: user.email,
    });
    return { accessToken, user: this.present(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { school: true, teacher: { select: { id: true } } },
    });
    return this.present(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false } });
    return { ok: true };
  }

  private present(user: Prisma.UserGetPayload<{ include: { school: true; teacher: { select: { id: true } } } }>) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      teacherId: user.teacher?.id ?? null,
      school: { id: user.school.id, name: user.school.name, code: user.school.code, timezone: user.school.timezone, lateAfter: user.school.lateAfter },
    };
  }
}

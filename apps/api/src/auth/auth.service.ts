import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { school: true, teacher: { select: { id: true } } },
    });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      schoolId: user.schoolId,
      role: user.role,
      email: user.email,
    });
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        teacherId: user.teacher?.id ?? null,
        school: { id: user.school.id, name: user.school.name },
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { school: true, teacher: { select: { id: true } } },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      teacherId: user.teacher?.id ?? null,
      school: { id: user.school.id, name: user.school.name, timezone: user.school.timezone, lateAfter: user.school.lateAfter },
    };
  }
}

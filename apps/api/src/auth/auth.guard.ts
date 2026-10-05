import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';

/** Global guard: requires a valid bearer token unless the route is @Public, then checks @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let user: AuthUser;
    try {
      const payload = await this.jwt.verifyAsync(token);
      user = { userId: payload.sub, schoolId: payload.schoolId, role: payload.role, email: payload.email };
    } catch {
      throw new UnauthorizedException();
    }
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

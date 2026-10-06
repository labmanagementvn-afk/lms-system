import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ALLOW_QUERY_TOKEN_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';

// Routes without @Roles are school-portal routes: parents, drivers, students and
// district officers only reach routes that name their role explicitly.
const PORTAL_ROLES: Role[] = [Role.ADMIN, Role.STAFF, Role.TEACHER];

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
    let [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (!token && this.reflector.getAllAndOverride<boolean>(ALLOW_QUERY_TOKEN_KEY, targets) && typeof req.query?.access_token === 'string') {
      [scheme, token] = ['Bearer', req.query.access_token];
    }
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let user: AuthUser;
    try {
      const payload = await this.jwt.verifyAsync(token);
      user = { userId: payload.sub, schoolId: payload.schoolId ?? '', districtId: payload.districtId ?? null, role: payload.role, email: payload.email };
    } catch {
      throw new UnauthorizedException();
    }
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets) ?? PORTAL_ROLES;
    if (!roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

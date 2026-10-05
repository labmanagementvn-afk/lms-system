import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Routes that every signed-in user may call, parents, drivers and students included. */
export const ALL_ROLES: Role[] = [Role.ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT, Role.DRIVER, Role.STUDENT];
export const AnyRole = () => Roles(...ALL_ROLES);

// Browsers cannot set headers on EventSource, so SSE routes accept ?access_token=.
export const ALLOW_QUERY_TOKEN_KEY = 'allowQueryToken';
export const AllowQueryToken = () => SetMetadata(ALLOW_QUERY_TOKEN_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/auth-user';
import { AuditService } from './audit.service';
import { areaOf, auditBody } from './redact';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** High-volume machine traffic that is not a person's action. */
const SKIP_AREAS = new Set(['iclock', 'healthz']);
const SKIP_PATHS = [/\/attendance\/ingest$/, /\/payments\/webhooks\//, /\/driver\/trips\/[^/]+\/location$/];

/**
 * Global interceptor: every state-changing call is written to the audit log with its
 * outcome once the handler finishes, whether it succeeded or threw. Public machine
 * endpoints (terminal pushes, payment webhooks, probes) are left out.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const path: string = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const area = areaOf(path);
    if (!WRITE_METHODS.has(method) || SKIP_AREAS.has(area) || SKIP_PATHS.some((re) => re.test(path))) return next.handle();

    const started = Date.now();
    const user: AuthUser | undefined = req.user;
    const write = (statusCode: number) =>
      this.audit.record({
        schoolId: user?.schoolId || null,
        districtId: user?.districtId ?? null,
        userId: user?.userId ?? null,
        userRole: user?.role ?? null,
        method,
        path,
        area,
        statusCode,
        ip: req.ip ?? null,
        userAgent: req.headers?.['user-agent'] ?? null,
        body: auditBody(req.body),
        durationMs: Date.now() - started,
      });

    return next.handle().pipe(
      tap({
        next: () => write(ctx.switchToHttp().getResponse().statusCode ?? 200),
        error: (e: unknown) => write(statusOf(e)),
      }),
    );
  }
}

/** Mirrors PrismaExceptionFilter so the log shows the status the client saw. */
function statusOf(e: unknown): number {
  if (e instanceof HttpException) return e.getStatus();
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === 'P2025' ? 404 : e.code === 'P2002' || e.code === 'P2003' ? 409 : 500;
  return 500;
}

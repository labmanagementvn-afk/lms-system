import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

const startedAt = Date.now();

/** Liveness/readiness probe for load balancers and uptime monitors; served at /healthz without the API prefix. */
@ApiTags('platform')
@Controller('healthz')
export class HealthzController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Readiness probe: 200 when the API can reach the database, 503 otherwise' })
  async check() {
    const t = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'error', time: new Date().toISOString() });
    }
    return {
      status: 'ok',
      db: 'ok',
      dbLatencyMs: Date.now() - t,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
      time: new Date().toISOString(),
    };
  }
}

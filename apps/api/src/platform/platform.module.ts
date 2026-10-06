import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthzController } from './healthz.controller';

/** Requests per minute per client IP; 0 disables the limiter (tests, batch imports). */
export const rateLimitPerMinute = () => Number(process.env.RATE_LIMIT_PER_MIN ?? 300);

/**
 * Cross-cutting hardening: a global per-IP rate limit (RATE_LIMIT_PER_MIN) and the
 * liveness/readiness probe. Security headers and the JSON body limit live in setup.ts.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: () => Math.max(rateLimitPerMinute(), 1) }],
        skipIf: () => rateLimitPerMinute() <= 0,
      }),
    }),
  ],
  controllers: [HealthzController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class PlatformModule {}

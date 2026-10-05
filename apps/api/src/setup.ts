import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

/** Shared between main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
  // Behind a reverse proxy (nginx, a cloud load balancer) the client IP for rate limiting
  // and audit logs comes from X-Forwarded-For; TRUST_PROXY takes Express's "trust proxy" values.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);

  // Security headers. CSP is off because Swagger UI and extracted SCORM packages run inline
  // scripts; frames and cross-origin resources are allowed because the web app (another origin)
  // embeds lesson files and SCORM pages served by this API.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, frameguard: false, crossOriginEmbedderPolicy: false }));

  // ZKTeco terminals post plain-text ATTLOG bodies; parse before Nest's JSON parser.
  app.use('/iclock', express.text({ type: () => true, limit: '5mb' }));
  // Registering a parser named "jsonParser" first makes Nest skip its own default (100 kB) one.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '10mb' }));
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'iclock/*path', method: RequestMethod.ALL },
      { path: 'healthz', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });

  const config = new DocumentBuilder()
    .setTitle('LMS System API')
    .setDescription(
      'Phase 1: school core and gate attendance. Phase 2: finance, store, canteen, library, health. Phase 3: parent and driver apps, notifications, homeroom, bus, admissions, HR, assets. Phase 4: gradebook, conduct, student accounts, e-learning. Phase 5: district dashboards, daily statistics and alerts, MOET data exchange, audit log',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}

import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

/** Shared between main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
  // ZKTeco terminals post plain-text ATTLOG bodies; parse before Nest's JSON parser.
  app.use('/iclock', express.text({ type: () => true, limit: '5mb' }));
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'iclock/*path', method: RequestMethod.ALL }] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });

  const config = new DocumentBuilder()
    .setTitle('LMS System API')
    .setDescription('Phase 1: school core and gate attendance. Phase 2: finance, store, canteen, library, health')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}

import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RespuestaInterceptor } from './common/respuesta.interceptor';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  // Validación de entradas con Zod (ZodValidationPipe por endpoint).
  app.useGlobalInterceptors(new RespuestaInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const puerto = config.get('PORTAL_USUARIO_PORT', { infer: true });
  await app.listen(puerto);
  Logger.log(`Portal de usuario API escuchando en http://localhost:${puerto}/api`, 'Bootstrap');
}

void bootstrap();

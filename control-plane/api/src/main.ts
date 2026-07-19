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
  // La validación de entradas se hace con Zod (ZodValidationPipe por endpoint),
  // no con el ValidationPipe de Nest (evita depender de class-validator).
  app.useGlobalInterceptors(new RespuestaInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const puerto = config.get('API_PORT', { infer: true });
  await app.listen(puerto);
  Logger.log(`Portal API escuchando en http://localhost:${puerto}/api`, 'Bootstrap');
}

void bootstrap();

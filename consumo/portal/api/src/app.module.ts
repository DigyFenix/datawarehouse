import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AdminModule } from './admin/admin.module';
import { AgenteModule } from './agente/agente.module';
import { InicioModule } from './inicio/inicio.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { validarEnv } from './config/env';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { OrganizacionModule } from './organizacion/organizacion.module';
import { TablerosModule } from './tableros/tableros.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raíz del repo (compartido con Docker/dbt).
      envFilePath: ['../../../.env', '.env'],
      validate: validarEnv,
    }),
    DbModule,
    AuthModule,
    OrganizacionModule,
    TablerosModule,
    AdminModule,
    AgenteModule,
    InicioModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard global: JWT propio del portal + coincidencia token↔tenant + es_admin fresco.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

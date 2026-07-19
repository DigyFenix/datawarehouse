import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AccesoModule } from './acceso/acceso.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { validarEnv } from './config/env';
import { DrizzleModule } from './db/drizzle.module';
import { GlosarioModule } from './glosario/glosario.module';
import { HealthController } from './health/health.controller';
import { MetricasModule } from './metricas/metricas.module';
import { OrganizacionesModule } from './organizaciones/organizaciones.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raíz del repo (compartido con Docker/dbt).
      envFilePath: ['../../.env', '.env'],
      validate: validarEnv,
    }),
    DrizzleModule,
    AuditoriaModule,
    AuthModule,
    UsuariosModule,
    AccesoModule,
    OrganizacionesModule,
    GlosarioModule,
    MetricasModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard de autenticación global: exige JWT salvo rutas @Publico().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

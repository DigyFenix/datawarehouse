/**
 * Módulo del agente de IA (CLAUDE.md §11). `SesionService`/`AuditoriaPortalService`
 * (AuthModule) y `ControlDbService`/`LectorPoolsService` (DbModule) son @Global(),
 * así que no hace falta importarlos aquí.
 */
import { Module } from '@nestjs/common';

import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { ConsultasGuardadasService } from './consultas-guardadas.service';
import { ConversacionesService } from './conversaciones.service';
import { LimiteAgenteGuard } from './limite-agente.guard';
import { SolicitudesService } from './solicitudes.service';
import { UsoIaService } from './uso-ia.service';

@Module({
  controllers: [AgenteController],
  providers: [AgenteService, ConversacionesService, ConsultasGuardadasService, SolicitudesService, UsoIaService, LimiteAgenteGuard],
  // Descargas (misma lectura gobernada) y Admin (bitácora de demanda) reutilizan estos servicios.
  exports: [AgenteService, SolicitudesService, UsoIaService, LimiteAgenteGuard],
})
export class AgenteModule {}

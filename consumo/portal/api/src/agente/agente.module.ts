/**
 * Módulo del agente de IA (CLAUDE.md §11). `SesionService`/`AuditoriaPortalService`
 * (AuthModule) y `ControlDbService`/`LectorPoolsService` (DbModule) son @Global(),
 * así que no hace falta importarlos aquí.
 */
import { Module } from '@nestjs/common';

import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { ConversacionesService } from './conversaciones.service';

@Module({
  controllers: [AgenteController],
  providers: [AgenteService, ConversacionesService],
})
export class AgenteModule {}

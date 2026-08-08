/** Consulta del log de auditoría (solo lectura). Requiere token (guard global). */
import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import { filtroAuditoriaSchema, FiltroAuditoriaDto } from './auditoria.dto';
import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly servicio: AuditoriaService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return {
      id: u?.id ?? null,
      email: u?.email ?? null,
      ip: req.ip ?? null,
      esGlobal: u?.esGlobal ?? false,
      orgIds: u?.orgIds ?? [],
    };
  }

  /**
   * Página de auditoría por cursor.
   * @param organizacionId filtro opcional; sin él, un actor no global ve solo sus organizaciones
   * @param limite tamaño de página (default 50, máx 200)
   * @param desdeId cursor: id menor de la página previa (orden id DESC)
   */
  @Get()
  @AlcanceOrg({ desde: 'query', opcional: true })
  listar(
    @Query(new ZodValidationPipe(filtroAuditoriaSchema)) filtro: FiltroAuditoriaDto,
    @Req() req: Request,
  ) {
    return this.servicio.listar(this.actor(req), filtro);
  }
}

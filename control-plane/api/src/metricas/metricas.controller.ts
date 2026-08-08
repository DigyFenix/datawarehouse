import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { RolesGlobales, RolesPermitidos } from '../auth/roles.decorator';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarMetricaSchema,
  ActualizarMetricaDto,
  crearMetricaSchema,
  CrearMetricaDto,
  crearVersionSchema,
  CrearVersionDto,
  enviarRevisionSchema,
  EnviarRevisionDto,
  votarSchema,
  VotarDto,
} from './metrica.dto';
import { MetricasService } from './metricas.service';

@Controller()
export class MetricasController {
  constructor(private readonly servicio: MetricasService) {}

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

  @Get('hechos')
  hechos() {
    return this.servicio.listarHechos();
  }

  @Get('metricas')
  listar() {
    return this.servicio.listar();
  }

  // Declarado ANTES de 'metricas/:id' para que Nest no lo capture como id.
  @Get('metricas/pendientes-de-mi-voto')
  pendientesDeMiVoto(@Req() req: Request) {
    return this.servicio.pendientesDeMiVoto(this.actor(req));
  }

  @Get('metricas/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Post('metricas')
  @RolesGlobales('admin_portal')
  crear(@Body(new ZodValidationPipe(crearMetricaSchema)) dto: CrearMetricaDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put('metricas/:id')
  @RolesGlobales('admin_portal')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarMetricaSchema)) dto: ActualizarMetricaDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Post('metricas/:id/versiones')
  @RolesGlobales('admin_portal')
  crearVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(crearVersionSchema)) dto: CrearVersionDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearVersion(id, dto, this.actor(req));
  }

  @Post('metricas/:id/versiones/:versionId/enviar-revision')
  @RolesPermitidos('admin_portal', 'admin_organizacion')
  enviarRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body(new ZodValidationPipe(enviarRevisionSchema)) dto: EnviarRevisionDto,
    @Req() req: Request,
  ) {
    return this.servicio.enviarRevision(id, versionId, dto.aprobadores, this.actor(req));
  }

  @Post('metricas/versiones/:versionId/votar')
  @RolesPermitidos('admin_portal', 'admin_organizacion')
  votar(
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body(new ZodValidationPipe(votarSchema)) dto: VotarDto,
    @Req() req: Request,
  ) {
    return this.servicio.votar(versionId, dto.aprobado, dto.comentario, this.actor(req));
  }

  @Post('metricas/:id/deprecar')
  @RolesPermitidos('admin_portal', 'admin_organizacion')
  deprecar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.deprecar(id, this.actor(req));
  }
}

import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req,
} from '@nestjs/common';
import { Request } from 'express';

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarConexionSchema, ActualizarConexionDto,
  crearConexionSchema, CrearConexionDto,
} from './conexiones.dto';
import { ConexionesService } from './conexiones.service';

@Controller()
export class ConexionesController {
  constructor(private readonly servicio: ConexionesService) {}

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

  /** Catálogo del motor (no es por tenant). */
  @Get('entornos')
  listarEntornos() {
    return this.servicio.listarEntornos();
  }

  /** Conexiones visibles para el actor (rol global = todas; si no, las de su membresía). */
  @Get('conexiones')
  listar(@Req() req: Request) {
    return this.servicio.listar(this.actor(req));
  }

  @Post('conexiones')
  @AlcanceOrg({ desde: 'body' })
  crear(@Body(new ZodValidationPipe(crearConexionSchema)) dto: CrearConexionDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put('conexiones/:id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarConexionSchema)) dto: ActualizarConexionDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Delete('conexiones/:id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminar(id, this.actor(req));
  }
}

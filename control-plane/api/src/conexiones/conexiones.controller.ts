import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req,
} from '@nestjs/common';
import { Request } from 'express';

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
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
  }

  @Get('entornos')
  listarEntornos() {
    return this.servicio.listarEntornos();
  }

  @Get('conexiones')
  listar() {
    return this.servicio.listar();
  }

  @Post('conexiones')
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

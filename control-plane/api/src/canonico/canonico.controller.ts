import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';

import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { RolesGlobales } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarCampoCanonicoSchema, ActualizarCampoCanonicoDto,
  crearCampoSchema, CrearCampoCanonicoDto,
  crearEntidadSchema, CrearEntidadDto,
} from './canonico.dto';
import { CanonicoService } from './canonico.service';

@Controller('canonico')
export class CanonicoController {
  constructor(private readonly servicio: CanonicoService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
  }

  @Get('entidades')
  listarEntidades() {
    return this.servicio.listarEntidades();
  }

  // Escritura del canónico (motor común, agnóstico): solo roles globales.
  @Post('entidades')
  @RolesGlobales('admin_portal')
  crearEntidad(@Body(new ZodValidationPipe(crearEntidadSchema)) dto: CrearEntidadDto, @Req() req: Request) {
    return this.servicio.crearEntidad(dto, this.actor(req));
  }

  @Get('campos')
  listarCampos(@Query('entidad') entidad?: string) {
    return this.servicio.listarCampos(entidad);
  }

  @Post('campos')
  @RolesGlobales('admin_portal')
  crearCampo(@Body(new ZodValidationPipe(crearCampoSchema)) dto: CrearCampoCanonicoDto, @Req() req: Request) {
    return this.servicio.crearCampo(dto, this.actor(req));
  }

  @Put('campos/:id')
  @RolesGlobales('admin_portal')
  actualizarCampo(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarCampoCanonicoSchema)) dto: ActualizarCampoCanonicoDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizarCampo(id, dto, this.actor(req));
  }

  @Delete('campos/:id')
  @RolesGlobales('admin_portal')
  eliminarCampo(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarCampo(id, this.actor(req));
  }
}

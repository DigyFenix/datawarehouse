import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarSociedadSchema, ActualizarSociedadDto,
  crearSociedadSchema, CrearSociedadDto,
  filtroSociedadesSchema, FiltroSociedadesDto,
} from './sociedades.dto';
import { SociedadesService } from './sociedades.service';

@Controller('sociedades')
export class SociedadesController {
  constructor(private readonly servicio: SociedadesService) {}

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
   * Sociedades de una organización.
   * @param organizacionId id de la organización (obligatorio)
   * @returns sociedades de esa organización, ordenadas por `orden` e id
   * @throws 400 si falta o no es un id válido · 401 sin token
   */
  @Get()
  @AlcanceOrg({ desde: 'query' })
  listar(@Query(new ZodValidationPipe(filtroSociedadesSchema)) filtro: FiltroSociedadesDto) {
    return this.servicio.listar(filtro.organizacionId);
  }

  @Post()
  @AlcanceOrg({ desde: 'body' })
  crear(@Body(new ZodValidationPipe(crearSociedadSchema)) dto: CrearSociedadDto, @Req() req: Request) {
    return this.servicio.crear(dto, this.actor(req));
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarSociedadSchema)) dto: ActualizarSociedadDto,
    @Req() req: Request,
  ) {
    return this.servicio.actualizar(id, dto, this.actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminar(id, this.actor(req));
  }
}

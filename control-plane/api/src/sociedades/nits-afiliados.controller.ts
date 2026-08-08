import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';

import { AlcanceOrg } from '../auth/alcance-org.decorator';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import {
  actualizarNitAfiliadoSchema, ActualizarNitAfiliadoDto,
  crearNitsAfiliadosSchema, CrearNitsAfiliadosDto,
  filtroNitsAfiliadosSchema, FiltroNitsAfiliadosDto,
} from './nits-afiliados.dto';
import { NitsAfiliadosService } from './nits-afiliados.service';

@Controller('nits-afiliados')
export class NitsAfiliadosController {
  constructor(private readonly servicio: NitsAfiliadosService) {}

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
   * NIT afiliados de una organización.
   * @param organizacionId id de la organización (obligatorio)
   * @returns lista con nit, nit_normalizado, nombre y activo
   * @throws 400 si falta o no es un id válido · 401 sin token
   */
  @Get()
  @AlcanceOrg({ desde: 'query' })
  listar(@Query(new ZodValidationPipe(filtroNitsAfiliadosSchema)) filtro: FiltroNitsAfiliadosDto) {
    return this.servicio.listar(filtro.organizacionId);
  }

  /**
   * Alta en lote (pegar lista). Duplicados (misma forma normalizada) se omiten.
   * @returns { creados, omitidos }
   * @throws 400 si algún NIT queda vacío tras normalizar · 404 organización
   */
  @Post()
  @AlcanceOrg({ desde: 'body' })
  crear(
    @Body(new ZodValidationPipe(crearNitsAfiliadosSchema)) dto: CrearNitsAfiliadosDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearLote(dto, this.actor(req));
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(actualizarNitAfiliadoSchema)) dto: ActualizarNitAfiliadoDto,
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

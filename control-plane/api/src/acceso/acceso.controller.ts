/** Endpoints de roles y autorizaciones. Gestión del producto: rol global admin_portal. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { RolesGlobales } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import {
  crearAutorizacionSchema,
  CrearAutorizacionDto,
  definirAprobadorSchema,
  DefinirAprobadorDto,
} from './acceso.dto';
import { AccesoService } from './acceso.service';

@Controller()
@RolesGlobales('admin_portal')
export class AccesoController {
  constructor(private readonly servicio: AccesoService) {}

  private actor(req: Request): Actor {
    const u = (req as Request & { user?: UsuarioAutenticado }).user;
    return { id: u?.id ?? null, email: u?.email ?? null, ip: req.ip ?? null };
  }

  @Get('roles')
  roles() {
    return this.servicio.listarRoles();
  }

  /** Habilita o retira a un rol la capacidad de firmar certificaciones. */
  @Put('roles/:id/aprobador')
  definirAprobador(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(definirAprobadorSchema)) dto: DefinirAprobadorDto,
    @Req() req: Request,
  ) {
    return this.servicio.definirAprobador(id, dto.puedeAprobar, this.actor(req));
  }

  @Get('autorizaciones')
  autorizaciones(@Query('rolId', ParseIntPipe) rolId: number) {
    return this.servicio.listarAutorizaciones(rolId);
  }

  @Post('autorizaciones')
  crear(
    @Body(new ZodValidationPipe(crearAutorizacionSchema)) dto: CrearAutorizacionDto,
    @Req() req: Request,
  ) {
    return this.servicio.crearAutorizacion(dto, this.actor(req));
  }

  @Delete('autorizaciones/:id')
  @HttpCode(204)
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.servicio.eliminarAutorizacion(id, this.actor(req));
  }
}

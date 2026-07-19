/** Endpoints de roles y autorizaciones. Requieren token (guard global). */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Actor } from '../organizaciones/organizaciones.service';
import type { UsuarioAutenticado } from '../auth/jwt-auth.guard';
import { crearAutorizacionSchema, CrearAutorizacionDto } from './acceso.dto';
import { AccesoService } from './acceso.service';

@Controller()
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
